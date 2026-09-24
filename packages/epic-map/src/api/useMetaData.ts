import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Geometry } from "geojson";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import type { MapExtent } from "@/types";
import { METADATA_STALE_MS } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const METADATA_PATH = "/catalogue/layers/metadata";

export interface FeatureAttribute {
  name: string;
  value: unknown;
}

export interface MetaDataFeature {
  /** The warehouse's id, or null when it is not stable enough to draw by. */
  id: string | null;
  /** What the layer's own map labels call it, or null when it labels nothing. */
  name: string | null;
  /** In the warehouse's column order. */
  properties: FeatureAttribute[];
  /** Null when too heavy for map-api to carry. */
  geometry: Geometry | null;
  /** Null when the geometry was not carried. */
  bounds: MapExtent | null;
}

export type MetaDataStatus = "found" | "empty" | "error";

/** What one layer of a click had to say, as map-api reports it. */
export interface MetaDataLayerResult {
  objectName: string;
  status: MetaDataStatus;
  feature: MetaDataFeature | null;
  /** Why this layer could not answer; null when it did. */
  error: string | null;
}

interface MetaDataBatchResponse {
  results: MetaDataLayerResult[];
}

/** Every layer's answer to one click, keyed by the object asked about. */
export type MetaDataByLayer = Record<string, MetaDataLayerResult>;

export interface MetaDataQuery {
  byLayer: MetaDataByLayer;
  /** The request itself failed, so no layer has an answer. */
  isError: boolean;
  /** Object names currently being asked again on their own. */
  retrying: ReadonlySet<string>;
  retry: (objectName: string) => void;
}

const byObjectName = (results: readonly MetaDataLayerResult[]): MetaDataByLayer =>
  Object.fromEntries(results.map((result) => [result.objectName, result]));

/**
 * One request per click, carrying every applied layer.
 */
export const useMetaData = (
  layers: readonly AppliedLayer[],
  box: MapExtent | null,
  click: number,
): MetaDataQuery => {
  const { api, clientId } = useMapWidget();

  const objectNames = useMemo(
    () =>
      layers
        .map((layer) => layer.objectName)
        .filter((name): name is string => Boolean(name)),
    [layers],
  );

  // Answers from a per-layer Retry, laid over the click's own. Reset by the
  // click key below, so a retry never outlives the click it belongs to.
  const [retried, setRetried] = useState<MetaDataByLayer>({});
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());
  const clickRef = useRef(click);
  if (clickRef.current !== click) {
    clickRef.current = click;
    if (Object.keys(retried).length > 0) setRetried({});
    if (retrying.size > 0) setRetrying(new Set());
  }

  const ask = useCallback(
    async (names: readonly string[], signal?: AbortSignal) => {
      const [west, south, east, north] = box as MapExtent;
      const response = await api.post<MetaDataBatchResponse>(
        METADATA_PATH,
        {
          objectNames: names,
          west,
          south,
          east,
          north,
          // Which click this is, so map-api can drop the layers of one the user
          // has already replaced instead of asking the warehouse for answers
          // nobody is listening for.
          clientId,
          clickId: click,
        },
        { signal },
      );
      return response.data.results;
    },
    [api, box, clientId, click],
  );

  const query = useQuery({
    // The box and the layers are the whole question. The click number is
    // deliberately not part of it: clicking the same point twice should be
    // answered from cache rather than asking the warehouse again.
    queryKey: epicMapQueryKey(
      "catalogue",
      "metadata",
      ...objectNames,
      ...(box ?? []),
    ),
    queryFn: ({ signal }) => ask(objectNames, signal),
    enabled: box !== null && objectNames.length > 0,
    staleTime: METADATA_STALE_MS,
    // A failure shows as its own row with a Retry, which is the user's call.
    retry: false,
    refetchOnWindowFocus: false,
  });

  const retry = useCallback(
    (objectName: string) => {
      if (box === null) return;
      setRetrying((names) => new Set(names).add(objectName));
      void ask([objectName])
        .then((results) => {
          setRetried((answers) => ({ ...answers, ...byObjectName(results) }));
        })
        .catch(() => {
          // Leaving the row as it was is the honest outcome: it still failed,
          // and its Retry is still there.
        })
        .finally(() => {
          setRetrying((names) => {
            const left = new Set(names);
            left.delete(objectName);
            return left;
          });
        });
    },
    [ask, box],
  );

  const byLayer = useMemo(
    () => ({ ...byObjectName(query.data ?? []), ...retried }),
    [query.data, retried],
  );

  return {
    byLayer,
    isError: query.isError,
    retrying,
    retry,
  };
};
