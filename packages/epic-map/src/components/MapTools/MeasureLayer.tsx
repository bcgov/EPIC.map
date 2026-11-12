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
  type MeasureShape,
} from "@/components/MapTools/measure";
import { SMALL_TEXT } from "@/components/MapTools/ToolPanel";
import { HIGHLIGHT_COLOR } from "@/utils/config";

const OFFSET_PX = 14;
// How near Point 1 the pointer must be to close the shape.
const CLOSE_PX = 10;

interface ScreenPoint {
  x: number;
  y: number;
}

interface Pointer extends ScreenPoint {
  at: LngLatPoint;
}

/** Where `first` is on screen, if `at` is over it. */
const over = (map: MapLibreMap, at: ScreenPoint, first: LngLatPoint): ScreenPoint | null => {
  const { x, y } = map.project(first);
  return Math.hypot(x - at.x, y - at.y) <= CLOSE_PX ? { x, y } : null;
};

/** The line or area on the map, plus the crosshair and tag while placing. */
export default function MeasureLayer({ map }: { map: MapLibreMap | null }) {
  const theme = useTheme();
  const { points, closed, placing, closable, add, close } = useMeasure();
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const first = points.length > 0 ? points[0] : null;

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

    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      container.style.cursor = "";
      if (zoomsOnDoubleClick) map.doubleClickZoom.enable();
      setPointer(null);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
    };
  }, [map, placing]);

  useEffect(() => {
    if (!map || !placing) return undefined;

    // A double-click's second click would stack a point on the first.
    const onClick = ({ point, lngLat, originalEvent }: MapMouseEvent) => {
      if (originalEvent.detail > 1) return;
      if (closable && first && over(map, point, first)) close();
      else add([lngLat.lng, lngLat.lat]);
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, placing, closable, first, add, close]);

  const closeAt = map && pointer && closable && first ? over(map, pointer, first) : null;
  const closing = closeAt !== null;
  const last = points.length > 0 ? points[points.length - 1] : null;
  const preview = useMemo(
    () => (last && pointer ? [last, closing && first ? first : pointer.at] : null),
    [last, first, pointer, closing],
  );

  const shape: MeasureShape = closed ? "closed" : closable ? "closable" : "open";

  useEffect(() => {
    if (map) drawMeasure(map, points, preview, shape);
  }, [map, points, preview, shape]);

  useEffect(
    () => () => {
      if (map) eraseMeasure(map);
    },
    [map],
  );

  if (!pointer) return null;
  const tagAt = closeAt ?? pointer;

  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        left: `${tagAt.x + OFFSET_PX}px`,
        top: `${tagAt.y}px`,
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
      {closing
        ? "close shape"
        : last
          ? `~${formatDistance(distance(last, pointer.at))}`
          : "Add first point"}
    </Box>
  );
}
