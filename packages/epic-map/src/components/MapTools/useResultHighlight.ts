import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useQueryClient } from "@tanstack/react-query";
import { importedFeaturesKey } from "@/api/useImportedLayers";
import { localFeatureQuery } from "@/api/useLocalLayerFeatures";
import { useWhatsHereApi } from "@/api/useWhatsHere";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  hideHighlight,
  localDrawnIds,
  showHighlight,
  showLocalHighlight,
} from "@/components/Layers/layerUtils";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import { boundsOutOfView } from "@/components/MetaData/metaDataUtils";
import type { MapExtent } from "@/types";
import {
  FOCUS_FLY_MS,
  FOCUS_MAX_ZOOM,
  FOCUS_PADDING_PX,
} from "@/utils/config";
import { geoBounds } from "@/utils/geo";
import { hostedLayer } from "@/utils/localLayers";
import { useMapWidget } from "@/widget/MapWidgetContext";

/** Highlights the focused result in gold, as Identify does, and frames it when out of view. */
export const useResultHighlight = (map: MapLibreMap | null) => {
  const { focused, results } = useSelectArea();
  const { layerFloors } = useLayers();
  const { api } = useMapWidget();
  const { warehouseBounds } = useWhatsHereApi();
  const queryClient = useQueryClient();

  const floors = useRef(layerFloors);
  floors.current = layerFloors;

  const target = useMemo(() => {
    if (focused?.kind !== "result") return null;
    const group = results?.find(({ key }) => key === focused.groupKey);
    const feature = group?.features.find(({ key }) => key === focused.featureKey);
    return group && feature ? { group, feature } : null;
  }, [focused, results]);

  // Primitives: the results list changes as rows are removed.
  const kind = target?.group.kind;
  const layerId = target?.group.layerId;
  const objectName = target?.group.objectName ?? null;
  const featureKey = target?.feature.key;
  const featureId = target?.feature.id ?? null;

  useEffect(() => {
    if (!map || !kind || !layerId || !featureKey) return undefined;
    let cancelled = false;

    // At least the layer's floor, so its raster draws.
    const frame = (bounds: MapExtent | null | undefined) => {
      if (cancelled || !bounds || !boundsOutOfView(map, bounds)) return;
      const camera = map.cameraForBounds(bounds, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
      });
      if (!camera) return;
      const floor = floors.current[layerId] ?? 0;
      map.easeTo({
        ...camera,
        zoom: Math.max(camera.zoom ?? floor, floor),
        duration: FOCUS_FLY_MS,
      });
    };

    if (kind === "catalogue" && objectName && featureId) {
      showHighlight(map, { objectName, featureId, geometry: null });
      warehouseBounds(objectName, featureId).then(frame, () => {});
    } else if (kind === "hosted" && objectName) {
      const spec = hostedLayer(objectName);
      const [drawn] = localDrawnIds(map, layerId);
      const sourceLayer = drawn ? map.getLayer(drawn)?.sourceLayer : undefined;
      if (spec && sourceLayer) {
        showLocalHighlight(map, {
          layerId,
          sourceLayer,
          keyProperty: spec.keyProperty,
          keys: [featureKey],
        });
      }
      queryClient
        .query(localFeatureQuery(api, objectName, featureKey))
        .then((detail) => frame(detail.bounds), () => {});
    } else if (kind === "imported") {
      const feature = queryClient
        .getQueryData<FeatureCollection>(importedFeaturesKey(layerId))
        ?.features.find(({ id }) => String(id) === featureKey);
      if (feature?.geometry) {
        showHighlight(map, { objectName: null, featureId: null, geometry: feature.geometry });
        frame(geoBounds([feature]));
      }
    }

    return () => {
      cancelled = true;
      hideHighlight(map);
    };
  }, [map, kind, layerId, objectName, featureKey, featureId, api, queryClient, warehouseBounds]);
};
