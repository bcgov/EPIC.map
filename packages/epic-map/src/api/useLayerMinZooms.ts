import { useQueries } from "@tanstack/react-query";
import { MIN_ZOOM_RETRY_MS } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const CATALOGUE_LAYERS_PATH = "/catalogue/layers";

interface LayerMinZoomResponse {
  minZoom: number | null;
}

/**
 * The zoom each layer starts drawing at, keyed by warehouse object name.
 *
 * Every BCGW layer publishes the coarsest scale its style draws at, and past
 * that scale openmaps answers a tile request with a blank image rather than an
 * error. The limits are nothing alike - across the catalogue they run from
 * 1:50,000 to 1:12,000,000, which is zoom 13 down to zoom 5 - so a layer gated
 * on one shared floor either disappears while the server would still draw it,
 * or is drawn where it can only ever come back empty.
 */
export const useLayerMinZooms = (objectNames: readonly string[]) => {
  const { api } = useMapWidget();

  return useQueries({
    queries: objectNames.map((objectName) => ({
      queryKey: epicMapQueryKey("catalogue", "min-zoom", objectName),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await api.get<LayerMinZoomResponse>(
          `${CATALOGUE_LAYERS_PATH}/${objectName}/min-zoom`,
          { signal },
        );
        return response.data.minZoom;
      },
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: (query: { state: { status: string } }) =>
        query.state.status === "error" ? MIN_ZOOM_RETRY_MS : false,
    })),
    combine: (results) => {
      const minZooms: Record<string, number | null> = {};
      results.forEach((result, index) => {
        if (result.data !== undefined) {
          minZooms[objectNames[index]] = result.data;
        }
      });
      return minZooms;
    },
  });
};
