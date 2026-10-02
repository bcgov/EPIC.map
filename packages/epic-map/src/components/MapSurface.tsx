import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
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
} from "@/utils/config";

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

  // Spliced in before the incoming basemap's first symbol layer, not appended.
  // Appending puts the widget's layers above the basemap's place names, which
  // is invisible for a thin outline and very visible once a layer carries a
  // translucent fill: the labels underneath it stop being readable.
  const firstSymbol = next.layers.findIndex((layer) => layer.type === "symbol");
  const at = firstSymbol === -1 ? next.layers.length : firstSymbol;

  return {
    ...next,
    sources: { ...next.sources, ...sources },
    layers: [
      ...next.layers.slice(0, at),
      ...layers,
      ...next.layers.slice(at),
    ],
  };
};

export default function MapSurface() {
  const { config, authorizeTileRequest } = useMapWidget();
  const { initialExtent, basemapStyles, onError } = config;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const [map, setMap] = useState<MapLibreMap | null>(null);

  const [unsupported, setUnsupported] = useState(false);

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
      // MapLibre fetches tiles itself, so a layer served by map-api needs its
      // token attached here rather than by the axios instance. Read once, at
      // construction, which is why authorizeTileRequest has to be stable - an
      // unstable one would tear down and rebuild the map on every render.
      transformRequest: (url) => authorizeTileRequest(url),
    });

    if (!instance.painter) {
      instance.remove();
      setUnsupported(true);
      onError({
        kind: "unknown",
        message:
          "The map could not be initialised: this browser did not provide a WebGL2 context.",
      });
      return;
    }

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
  }, [onError, authorizeTileRequest]);

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
      {unsupported ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            width: "100%",
            height: "100%",
            p: 3,
            textAlign: "center",
          }}
        >
          <Typography variant="h6">This browser cannot show the map</Typography>
          <Typography variant="body2" color="text.secondary">
            The map is drawn with WebGL, which is unavailable here. Turning on
            hardware acceleration in the browser&rsquo;s settings usually
            restores it.
          </Typography>
        </Box>
      ) : (
        <>
          <Box ref={containerRef} sx={{ width: "100%", height: "100%" }} />
          <LayersControl map={map} />
          <BasemapSwitch current={basemap} onSelect={setBasemap} />
        </>
      )}
    </Box>
  );
}
