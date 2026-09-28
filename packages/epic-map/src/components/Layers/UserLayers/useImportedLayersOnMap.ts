import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { alpha, useTheme } from "@mui/material/styles";
import {
  IMPORTED_LAYERS_PATH,
  importedFeaturesKey,
  type ImportedLayer,
} from "@/api/useImportedLayers";
import {
  removeImportedLayer,
  setImportedLayerOpacity,
  setImportedLayerVisibility,
  showImportedLayer,
} from "@/components/Layers/layerUtils";
import { DEFAULT_LAYER_OPACITY } from "@/utils/config";
import { useMapWidget } from "@/widget/MapWidgetContext";

/** Stable, so the combined result keeps its identity until a layer's data changes. */
const featuresAndFailures = (results: UseQueryResult<FeatureCollection>[]) => ({
  data: results.map((result) => result.data ?? null),
  // Not while asking again, so Try again visibly does something.
  failed: results.map((result) => result.isError && !result.isFetching),
});

/**
 * Keeps the user's imported layers on the map as the panel says they should be.
 *
 * A layer's features are fetched the first time it is switched on and kept:
 * they never change after upload, and a basemap switch carries the drawn
 * source across. Switching a layer off hides it rather than removing it.
 *
 * Returns the layers whose features could not be fetched, and a way to ask
 * again, so a row can say why its layer is missing from the map.
 */
export const useImportedLayersOnMap = (
  map: MapLibreMap | null,
  layers: readonly ImportedLayer[],
  shownIds: ReadonlySet<string>,
  opacities: Readonly<Record<string, number>>,
) => {
  const { api } = useMapWidget();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const { data: features, failed } = useQueries({
    queries: layers.map((layer) => ({
      queryKey: importedFeaturesKey(layer.id),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await api.get<FeatureCollection>(
          `${IMPORTED_LAYERS_PATH}/${layer.id}/features`,
          { signal },
        );
        return response.data;
      },
      enabled: shownIds.has(layer.id),
      staleTime: Infinity,
      retry: false,
    })),
    combine: featuresAndFailures,
  });

  const colors = useMemo(
    () => ({
      line: theme.palette.primary.main,
      fill: alpha(theme.palette.primary.main, 0.35),
    }),
    [theme],
  );

  const drawn = useRef(new Set<string>());

  const opacitiesRef = useRef(opacities);
  opacitiesRef.current = opacities;

  // A new map starts empty, whatever the last one had on it.
  useEffect(() => {
    const onMap = drawn.current;
    return () => onMap.clear();
  }, [map]);

  useEffect(() => {
    if (!map) return;

    const wanted = new Set(layers.map((layer) => layer.id));
    for (const id of drawn.current) {
      if (wanted.has(id)) continue;
      removeImportedLayer(map, id);
      drawn.current.delete(id);
    }

    layers.forEach((layer, index) => {
      const visible = shownIds.has(layer.id);
      if (drawn.current.has(layer.id)) {
        setImportedLayerVisibility(map, layer.id, visible);
        return;
      }
      const data = features[index];
      if (!data || !visible) return;
      showImportedLayer(
        map,
        layer.id,
        data,
        colors,
        opacitiesRef.current[layer.id] ?? DEFAULT_LAYER_OPACITY,
      );
      drawn.current.add(layer.id);
    });
  }, [map, layers, features, colors, shownIds]);

  useEffect(() => {
    if (!map) return;
    for (const id of drawn.current)
      setImportedLayerOpacity(map, id, opacities[id] ?? DEFAULT_LAYER_OPACITY);
  }, [map, opacities]);

  const failedIds = useMemo(
    () =>
      new Set(
        layers.filter((_, index) => failed[index]).map((layer) => layer.id),
      ),
    [layers, failed],
  );

  const retryFeatures = useCallback(
    (layerId: string) =>
      void queryClient.refetchQueries({ queryKey: importedFeaturesKey(layerId) }),
    [queryClient],
  );

  return { failedIds, retryFeatures };
};
