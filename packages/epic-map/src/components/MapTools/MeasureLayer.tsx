import { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useMeasure } from "@/components/MapTools/MeasureContext";
import {
  distance,
  drawMeasure,
  eraseMeasure,
  formatDistance,
  type LngLatPoint,
} from "@/components/MapTools/measure";
import { SMALL_TEXT } from "@/components/MapTools/ToolPanel";
import { HIGHLIGHT_COLOR } from "@/utils/config";

const OFFSET_PX = 14;

interface Pointer {
  x: number;
  y: number;
  at: LngLatPoint;
}

/** The line on the map, plus the crosshair and tag while placing. */
export default function MeasureLayer({ map }: { map: MapLibreMap | null }) {
  const theme = useTheme();
  const { points, placing, add } = useMeasure();
  const [pointer, setPointer] = useState<Pointer | null>(null);

  useEffect(() => {
    if (!map || !placing) return undefined;

    // The dot hover resets the canvas's cursor, so set the container's.
    const container = map.getCanvasContainer();
    container.style.cursor = "crosshair";
    const zoomsOnDoubleClick = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const onMove = ({ point, lngLat }: MapMouseEvent) =>
      setPointer({ x: point.x, y: point.y, at: [lngLat.lng, lngLat.lat] });
    const onOut = () => setPointer(null);
    // A double-click's second click would stack a point on the first.
    const onClick = ({ lngLat, originalEvent }: MapMouseEvent) => {
      if (originalEvent.detail > 1) return;
      add([lngLat.lng, lngLat.lat]);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("click", onClick);
    return () => {
      container.style.cursor = "";
      if (zoomsOnDoubleClick) map.doubleClickZoom.enable();
      setPointer(null);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("click", onClick);
    };
  }, [map, placing, add]);

  const last = points.length > 0 ? points[points.length - 1] : null;
  const preview = useMemo(
    () => (last && pointer ? [last, pointer.at] : null),
    [last, pointer],
  );

  useEffect(() => {
    if (map) drawMeasure(map, points, preview);
  }, [map, points, preview]);

  useEffect(
    () => () => {
      if (map) eraseMeasure(map);
    },
    [map],
  );

  if (!pointer) return null;

  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        left: `${pointer.x + OFFSET_PX}px`,
        top: `${pointer.y}px`,
        transform: "translateY(-50%)",
        zIndex: 2,
        pointerEvents: "none",
        padding: "0.125rem 0.375rem",
        ...SMALL_TEXT,
        whiteSpace: "nowrap",
        color: theme.palette.text.primary,
        backgroundColor: HIGHLIGHT_COLOR,
        borderRadius: `${theme.shape.borderRadius}px`,
      }}
    >
      {last ? `~${formatDistance(distance(last, pointer.at))}` : "Add first point"}
    </Box>
  );
}
