import { useQueries } from "@tanstack/react-query";
import type { MapExtent } from "@/types";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const LOCAL_LAYERS_PATH = "/local/layers";

/**
 * One feature of a hosted layer, in full.
 *
 * Typed loosely on purpose: the endpoint returns everything the ingest carried
 * for the layer, and which fields those are is the layer's business. What this
 * package relies on is named, and the rest is carried through for whoever reads
 * a particular layer's records.
 */
export interface LocalFeatureDetail {
  name?: string | null;
  /** West, south, east, north in degrees, for pointing the camera. */
  bounds?: MapExtent | null;
  /** One entry per set of attributes recorded against this geometry. */
  contacts?: Array<Record<string, unknown>>;
  [field: string]: unknown;
}

export interface LocalFeatureQuery {
  /** The full record, or null while it is on its way or if it failed. */
  detail: LocalFeatureDetail | null;
  isPending: boolean;
  isError: boolean;
  /** Ask again, for the row that failed. */
  retry: () => void;
}

/** One feature of one hosted layer, as the popup asks for it. */
export interface LocalFeatureRef {
  objectName: string;
  key: string;
}

/** How an answer is looked up, since a click can cross hosted layers. */
export const localFeatureRef = (objectName: string, key: string): string =>
  `${objectName}::${key}`;

/**
 * The records behind the hosted features under one click.
 *
 * A request per feature rather than one for the lot: the tile hands out keys,
 * and the endpoint that turns a key into contacts is per feature. A click
 * lands on a handful of overlapping areas at most, and each answer is cached
 * under its own key, so clicking the same area twice asks nothing.
 */
export const useLocalLayerFeatures = (
  refs: readonly LocalFeatureRef[],
): Readonly<Record<string, LocalFeatureQuery>> => {
  const { api } = useMapWidget();

  const results = useQueries({
    queries: refs.map(({ objectName, key }) => ({
      queryKey: epicMapQueryKey("local", "feature", objectName, key),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await api.get<LocalFeatureDetail>(
          `${LOCAL_LAYERS_PATH}/${objectName}/features/${key}`,
          { signal },
        );
        return response.data;
      },
      // The rows change when someone reloads the extract, which is on the order
      // of months, and the popup is reopened constantly.
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  return Object.fromEntries(
    refs.map(({ objectName, key }, index) => {
      const result = results[index];
      return [
        localFeatureRef(objectName, key),
        {
          detail: result?.data ?? null,
          isPending: Boolean(result?.isPending),
          isError: Boolean(result?.isError),
          retry: () => {
            result?.refetch();
          },
        },
      ];
    }),
  );
};
