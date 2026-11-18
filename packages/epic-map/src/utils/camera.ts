import {
  LngLat,
  type PaddingOptions,
  type TransformConstrainFunction,
} from "maplibre-gl";
import {
  CENTER_BOUNDS,
  FOCUS_PADDING_PX,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/utils/config";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Keeps the camera's centre inside CENTER_BOUNDS. Replaces MapLibre's own
 * constrain, so it has to clamp the zoom range itself.
 */
export const constrainToBC: TransformConstrainFunction = (lngLat, zoom) => {
  const [west, south, east, north] = CENTER_BOUNDS;
  return {
    center: new LngLat(
      clamp(lngLat.lng, west, east),
      clamp(lngLat.lat, south, north),
    ),
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
  };
};

/** Focus padding, widened on the right to clear a panel that sits over the map. */
export const paddingClearOf = (
  container: { right: number },
  panel: { left: number } | null,
): PaddingOptions => {
  const covered = panel ? Math.max(0, container.right - panel.left) : 0;
  return {
    top: FOCUS_PADDING_PX,
    bottom: FOCUS_PADDING_PX,
    left: FOCUS_PADDING_PX,
    right: FOCUS_PADDING_PX + covered,
  };
};
