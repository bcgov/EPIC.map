import { LngLat, type TransformConstrainFunction } from "maplibre-gl";
import { CENTER_BOUNDS, MAX_ZOOM, MIN_ZOOM } from "@/utils/config";

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
