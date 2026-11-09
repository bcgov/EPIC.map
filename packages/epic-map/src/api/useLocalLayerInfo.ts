import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const LOCAL_LAYERS_PATH = "/local/layers";

export interface LocalLayerInfo {
  objectName: string;
  /** The delivered extract's own last-changed date, or null if it has none. */
  lastUpdated: string | null;
}

/**
 * What the panel says about a layer map-api hosts, rather than about a feature.
 *
 * Dated by the delivered file's metadata, as the catalogue record is not public.
 *
 * Refetched rarely: the ingest runs daily at most, and a date that is a few
 * minutes stale is the same date.
 */
export const useLocalLayerInfo = (objectName: string | null) => {
  const { api } = useMapWidget();

  return useQuery({
    queryKey: epicMapQueryKey("local", "info", objectName),
    queryFn: async ({ signal }) => {
      const response = await api.get<LocalLayerInfo>(
        `${LOCAL_LAYERS_PATH}/${objectName}`,
        { signal },
      );
      return response.data;
    },
    enabled: Boolean(objectName),
    staleTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
};
