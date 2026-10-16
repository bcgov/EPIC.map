import { useQuery } from "@tanstack/react-query";
import type { LocalLayerStyle } from "@/components/Layers/layerUtils";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const LOCAL_LAYERS_PATH = "/local/layers";

/**
 * How to draw a layer map-api hosts itself.
 *
 * A catalogue layer arrives from openmaps already drawn, so the widget never
 * has to know what it looks like. A hosted layer is geometry, and this is the
 * symbology that goes with it - translated on the server out of the ArcGIS
 * layer file the data came with, so that what the map draws is what BC staff
 * see in iMap rather than something approximated here.
 *
 * Cached indefinitely: it changes only when someone reloads the extract.
 */
export const useLocalLayerStyle = (objectName: string | null) => {
  const { api } = useMapWidget();

  return useQuery({
    queryKey: epicMapQueryKey("local", "style", objectName),
    queryFn: async ({ signal }) => {
      const response = await api.get<LocalLayerStyle>(
        `${LOCAL_LAYERS_PATH}/${objectName}/style`,
        { signal },
      );
      return response.data;
    },
    enabled: Boolean(objectName),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });
};
