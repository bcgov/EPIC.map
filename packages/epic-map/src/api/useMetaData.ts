import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { Geometry } from "geojson";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import type { MapExtent } from "@/types";
import { METADATA_STALE_MS } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const CATALOGUE_LAYERS_PATH = "/catalogue/layers";

export interface FeatureAttribute {
  name: string;
  value: unknown;
}

export interface MetaDataFeature {
  /** The warehouse's id, or null when it is not stable enough to draw by. */
  id: string | null;
  /** In the warehouse's column order. */
  properties: FeatureAttribute[];
  /** Null when too heavy for map-api to carry. */
  geometry: Geometry | null;
  /** Null when the geometry was not carried. */
  bounds: MapExtent | null;
}

interface MetaDataResponse {
  feature: MetaDataFeature | null;
}

export type MetaDataResult = UseQueryResult<MetaDataFeature | null>;

/**
 * What each layer has at a clicked box, one request per layer.
 *
 * Separate requests rather than one batch so each layer answers, fails and is
 * retried on its own: one slow warehouse table should not hold up the rest.
 */
export const useMetaData = (
  layers: readonly AppliedLayer[],
  box: MapExtent | null,
): MetaDataResult[] => {
  const { api } = useMapWidget();

  return useQueries({
    queries: layers.map((layer) => ({
      queryKey: epicMapQueryKey(
        "catalogue",
        "metadata",
        layer.objectName,
        ...(box ?? []),
      ),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const [west, south, east, north] = box as MapExtent;
        const response = await api.get<MetaDataResponse>(
          `${CATALOGUE_LAYERS_PATH}/${layer.objectName}/metadata`,
          { signal, params: { west, south, east, north } },
        );
        return response.data.feature;
      },
      enabled: box !== null && Boolean(layer.objectName),
      staleTime: METADATA_STALE_MS,
      // A failure shows as its own row with a Retry, which is the user's call.
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
};
