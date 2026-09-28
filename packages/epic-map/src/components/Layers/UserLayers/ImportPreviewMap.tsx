import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import type { FeatureCollection } from "geojson";
import { Map as MapLibreMap } from "maplibre-gl";
import { alpha, useTheme } from "@mui/material/styles";
import type { MapExtent } from "@/types";
import { useMapWidget } from "@/widget/MapWidgetContext";
import {
  DEFAULT_BASEMAP,
  DEFAULT_EXTENT,
  FOCUS_MAX_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveBasemap,
} from "@/utils/config";

const SOURCE_ID = "epic-import-preview";
/** Room, in pixels, between the features and the edge of the preview. */
const PREVIEW_PADDING_PX = 24;
/**
 * The preview takes whatever height the form leaves it, down to this - past
 * which a map says nothing and the fields are better off scrolling.
 */
export const MIN_PREVIEW_HEIGHT = "16rem";

/**
 * What the file looks like on a map, before it is imported.
 *
 * Its own MapLibre instance rather than the map behind the dialog: nothing is
 * added to the real map until the user uploads, so cancelling cannot leave a
 * layer behind.
 */
export default function ImportPreviewMap({
  geojson,
  bounds,
}: {
  geojson: FeatureCollection;
  bounds: MapExtent | null;
}) {
  const theme = useTheme();
  const { config } = useMapWidget();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Read once, inside the effect: a redraw on every keystroke in the form
  // would tear the map down and rebuild it.
  const contents = useRef({ geojson, bounds });
  contents.current = { geojson, bounds };

  const style = resolveBasemap(DEFAULT_BASEMAP, config.basemapStyles).style;
  const line = theme.palette.primary.main;
  const fill = alpha(theme.palette.primary.main, 0.35);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style,
      bounds: DEFAULT_EXTENT,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // A still picture of the file: panning it would say nothing the real map
      // does not say better once the layer is imported.
      interactive: false,
    });
    if (!map.painter) {
      map.remove();
      return;
    }

    map.on("load", () => {
      const { geojson: data, bounds: extent } = contents.current;
      map.addSource(SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: `${SOURCE_ID}-fill`,
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": fill },
      });
      map.addLayer({
        id: `${SOURCE_ID}-line`,
        type: "line",
        source: SOURCE_ID,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": line, "line-width": 2 },
      });
      map.addLayer({
        id: `${SOURCE_ID}-point`,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": fill,
          "circle-stroke-color": line,
          "circle-stroke-width": 2,
        },
      });

      if (extent)
        map.fitBounds(extent, {
          padding: PREVIEW_PADDING_PX,
          maxZoom: FOCUS_MAX_ZOOM,
          duration: 0,
        });
    });

    // The dialog grows into place, so the canvas is sized before the box it
    // sits in has finished settling.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [style, fill, line]);

  return (
    <Box
      ref={containerRef}
      role="img"
      aria-label={`Preview of the ${geojson.features.length} features in this file`}
      sx={{
        // Fills what the dialog has left after the summary and the form.
        flex: "1 1 auto",
        minHeight: MIN_PREVIEW_HEIGHT,
        borderRadius: `${theme.shape.borderRadius}px`,
        border: `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    />
  );
}
