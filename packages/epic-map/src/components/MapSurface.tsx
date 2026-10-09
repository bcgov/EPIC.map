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
import MapMessage from "@/components/Filters/MapMessage";
import MetaDataControl from "@/components/MetaData/MetaDataControl";
import LayersControl from "@/components/Layers/LayersControl";
import { LayersProvider } from "@/components/Layers/LayersContext";
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

  return {
    ...next,
    sources: { ...next.sources, ...sources },
    // Appended, so the widget's layers stay above the basemap's.
    layers: [...next.layers, ...layers],
  };
};

/**
 * The map itself, and everything drawn over it.
 *
 * `onMapReady` hands the MapLibre instance up to the widget root, because one
 * control that needs it — the search field — lives in the bar above this
 * component rather than inside it. Called with the instance once it is built and
 * with null as it is torn down, so a holder above never keeps a removed map.
 */
export default function MapSurface({
  onMapReady,
}: {
  onMapReady?: (map: MapLibreMap | null) => void;
}) {
  const { config } = useMapWidget();
  const { initialExtent, basemapStyles, onError } = config;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const [map, setMap] = useState<MapLibreMap | null>(null);

  // Held in a ref rather than named as an effect dependency: the map is built
  // once, and a caller passing an inline callback would otherwise tear it down
  // and rebuild it on every render.
  const notifyReady = useRef(onMapReady);
  notifyReady.current = onMapReady;

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
    notifyReady.current?.(instance);

    return () => {
      setMap(null);
      notifyReady.current?.(null);
      instance.remove();
    };
  }, [onError]);

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
          <LayersProvider map={map}>
            <LayersControl />
            <MetaDataControl />
          </LayersProvider>
          <BasemapSwitch current={basemap} onSelect={setBasemap} />
          <MapMessage />
        </>
      )}
    </Box>
  );
}
