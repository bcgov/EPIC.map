import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapExtent } from "@/types";
import {
  effectiveMinZoom,
  FOCUS_FLY_MS,
  FOCUS_MAX_ZOOM,
  FOCUS_PADDING_PX,
} from "@/utils/config";
import { useMapWidget } from "@/widget/MapWidgetContext";

const CATALOGUE_LAYERS_PATH = "/catalogue/layers";

interface NearestFeatureResponse {
  bounds: MapExtent;
}

/**
 * Fly the map to the part of a layer nearest where the user is already looking.
 *
 * The bounds come from map-api: openmaps answers WFS but sends no
 * `access-control-allow-origin`, so the browser is not allowed to read it. Only
 * the tiles can be fetched here, and a tile says nothing about where the
 * features are.
 */
export const useLayerFocus = () => {
  const { api } = useMapWidget();

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const markPending = useCallback((layerId: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(layerId);
      else next.delete(layerId);
      return next;
    });
  }, []);

  const { mutate } = useMutation({
    mutationFn: async ({
      objectName,
      lng,
      lat,
    }: {
      layerId: string;
      map: MapLibreMap;
      objectName: string;
      lng: number;
      lat: number;
      /** The layer's own drawing floor, or undefined while it is unknown. */
      minZoom?: number | null;
    }) => {
      const response = await api.get<NearestFeatureResponse>(
        `${CATALOGUE_LAYERS_PATH}/${objectName}/nearest-feature`,
        { params: { lon: lng, lat } },
      );
      return response.data.bounds;
    },
    onMutate: ({ layerId }) => markPending(layerId, true),
    onSuccess: (bounds, { map, minZoom }) => {
      const camera = map.cameraForBounds(bounds, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
      });
      if (!camera) return;

      const floor = effectiveMinZoom(minZoom);
      map.easeTo({
        ...camera,
        zoom: Math.max(camera.zoom ?? floor, floor),
        duration: FOCUS_FLY_MS,
      });
    },
    onSettled: (_bounds, _error, { layerId }) => markPending(layerId, false),
  });

  const focusLayer = useCallback(
    (
      layerId: string,
      objectName: string,
      map: MapLibreMap,
      minZoom?: number | null,
    ) => {
      if (pendingIds.has(layerId)) return;
      const { lng, lat } = map.getCenter();
      mutate({ layerId, map, objectName, lng, lat, minZoom });
    },
    [pendingIds, mutate],
  );

  return { focusLayer, focusPendingIds: pendingIds };
};
