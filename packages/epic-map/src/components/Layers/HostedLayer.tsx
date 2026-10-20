import { useEffect } from "react";
import { useLocalLayerStyle } from "@/api/useLocalLayerStyle";
import {
  hideLocalVectorLayer,
  setLocalVectorLayerOpacity,
  showLocalVectorLayer,
} from "@/components/Layers/layerUtils";
import { useLayers } from "@/components/Layers/LayersContext";
import { DEFAULT_LAYER_OPACITY, localTileUrl } from "@/utils/config";
import { localLayerId } from "@/utils/localLayers";
import { useMapWidget } from "@/widget/MapWidgetContext";

/**
 * Draws one layer map-api hosts, following its row in the panel.
 *
 * A component per layer rather than a loop in the provider: each needs its own
 * style, and a style is a query. Mounted whether or not the layer is on, so
 * turning it on is a request rather than a remount.
 *
 * Being on is session state: a hosted layer is not in `user_applied_layers`,
 * whose rows carry a catalogue package it does not have. The favourite itself
 * map-api does keep.
 */
export default function HostedLayer({ objectName }: { objectName: string }) {
  const { map, visibleIds, opacities } = useLayers();
  const { apiBaseUrl } = useMapWidget();

  const layerId = localLayerId(objectName);
  const visible = visibleIds.has(layerId);
  const opacity = opacities[layerId] ?? DEFAULT_LAYER_OPACITY;

  // Not asked for until wanted: the style is a few hundred classes.
  const { data: style } = useLocalLayerStyle(visible ? objectName : null);

  useEffect(() => {
    if (!map) return;

    if (!visible) {
      hideLocalVectorLayer(map, layerId);
      return;
    }

    // Nothing to draw until the style arrives. Adding the source first and
    // painting later would show the layer in MapLibre's default blue, which is
    // worse than showing it a moment later.
    if (!style) return;

    showLocalVectorLayer(
      map,
      layerId,
      localTileUrl(apiBaseUrl, objectName),
      style,
    );
    setLocalVectorLayerOpacity(map, layerId, style, opacity);
  }, [map, layerId, objectName, visible, style, apiBaseUrl, opacity]);

  return null;
}
