import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type TransformStyleFunction,
} from "maplibre-gl";
import { useMapWidget } from "@/widget/MapWidgetContext";
import BasemapSwitch from "@/components/BasemapSwitch";
import LayersControl from "@/components/Layers/LayersControl";
import {
  DEFAULT_BASEMAP,
  DEFAULT_EXTENT,
  MAX_ZOOM,
  MIN_ZOOM,
  WIDGET_ID_PREFIX,
  resolveBasemap,
  type BasemapId,
} from "@/config";

/**
 * Carry the widget's own sources and layers onto an incoming basemap.
 */
const carryWidgetLayers: TransformStyleFunction = (previous, next) => {
  if (!previous) return next;

  const sources = Object.fromEntries(
    Object.entries(previous.sources).filter(([id]) =>
      id.startsWith(WIDGET_ID_PREFIX),
    ),
  );
  const layers = previous.layers.filter((layer) =>
    layer.id.startsWith(WIDGET_ID_PREFIX),
  );

  return {
    ...next,
    sources: { ...next.sources, ...sources },
    // Appended, so the widget's layers stay above the basemap's.
    layers: [...next.layers, ...layers],
  };
};

export default function MapSurface() {
  const { config } = useMapWidget();
  const { initialExtent, basemapStyles } = config;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const [map, setMap] = useState<MapLibreMap | null>(null);

  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const activeStyle = resolveBasemap(basemap, basemapStyles).style;

  // What the map is actually showing. Tracking the style rather than the id
  // covers both ways it can change: the user picks the other basemap, or the
  // host passes a different URL for the one already on screen.
  const appliedStyle = useRef(activeStyle);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = new MapLibreMap({
      container,
      style: appliedStyle.current,
      bounds: DEFAULT_EXTENT,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      dragRotate: false,
      touchZoomRotate: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    instance.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        // Single-shot: fly there once rather than following the user around.
        trackUserLocation: false,
        showAccuracyCircle: true,
      }),
      "bottom-right",
    );
    instance.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    setMap(instance);

    return () => {
      setMap(null);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || !initialExtent) return;
    map.fitBounds(initialExtent, { duration: 0 });
  }, [map, initialExtent]);

  // setStyle keeps the camera where it is, so a switch changes what is under the
  // user without moving them.
  useEffect(() => {
    if (!map || appliedStyle.current === activeStyle) return;
    appliedStyle.current = activeStyle;
    map.setStyle(activeStyle, { transformStyle: carryWidgetLayers });
  }, [map, activeStyle]);

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <Box ref={containerRef} sx={{ width: "100%", height: "100%" }} />
      <LayersControl map={map} />
      <BasemapSwitch current={basemap} onSelect={setBasemap} />
    </Box>
  );
}
