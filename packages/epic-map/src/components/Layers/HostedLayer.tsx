import { useEffect } from "react";
import { useLocalLayerStyle } from "@/api/useLocalLayerStyle";
import {
  hideHighlight,
  hideLocalVectorLayer,
  setLocalVectorLayerFilters,
  setLocalVectorLayerLineWidth,
  setLocalVectorLayerOpacity,
  showLocalHighlight,
  showLocalVectorLayer,
} from "@/components/Layers/layerUtils";
import { useHostedLayerFilters } from "@/components/Layers/useHostedLayerFilters";
import { useHostedLayerHighlight } from "@/components/Layers/useHostedLayerHighlight";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  DEFAULT_LAYER_LINE_WIDTH,
  DEFAULT_LAYER_OPACITY,
  localTileUrl,
} from "@/utils/config";
import {
  hasWidthSlider,
  hostedLayer,
  isAlwaysDrawn,
  localLayerId,
} from "@/utils/localLayers";
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
  const { map, visibleIds, opacities, lineWidths } = useLayers();
  const { apiBaseUrl } = useMapWidget();

  const layerId = localLayerId(objectName);
  // An always-drawn layer has no row to switch on: it follows the filter bar,
  // so the panel's set says nothing about whether it should be drawn.
  const visible = isAlwaysDrawn(objectName) || visibleIds.has(layerId);
  const opacity = opacities[layerId] ?? DEFAULT_LAYER_OPACITY;
  // Null for a layer whose slider is an opacity: its style keeps its widths.
  const lineWidth = hasWidthSlider(objectName)
    ? (lineWidths[layerId] ?? DEFAULT_LAYER_LINE_WIDTH)
    : null;

  // Not asked for until wanted: the style is a few hundred classes.
  const { data: style } = useLocalLayerStyle(visible ? objectName : null);
  // Narrows what is drawn, where the layer has a reason beyond its symbology.
  const filters = useHostedLayerFilters(objectName, style);
  const highlighted = useHostedLayerHighlight(objectName);
  const sourceLayer = style?.layers[0]?.sourceLayer;
  const keyProperty = hostedLayer(objectName)?.keyProperty;

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
    if (lineWidth != null) {
      setLocalVectorLayerLineWidth(map, layerId, style, lineWidth);
    }
    // After showing: adding a layer takes the style's filter, so the client's
    // reason has to be applied to the layer that now exists.
    setLocalVectorLayerFilters(map, layerId, style, filters);
  }, [
    map,
    layerId,
    objectName,
    visible,
    style,
    apiBaseUrl,
    opacity,
    lineWidth,
    filters,
  ]);

  // After the layer's own effect, so its tiles are there to filter.
  useEffect(() => {
    if (!map || !visible || !sourceLayer || !keyProperty || !highlighted.length) {
      return undefined;
    }
    showLocalHighlight(map, { layerId, sourceLayer, keyProperty, keys: highlighted });
    return () => hideHighlight(map);
  }, [map, visible, layerId, sourceLayer, keyProperty, highlighted]);

  return null;
}
