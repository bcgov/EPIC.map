import type { Feature, Position } from "geojson";
import type { MapExtent } from "@/types";

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

/** The extent of every position in the features, walked rather than trusted to `bbox`. */
export const geoBounds = (features: readonly Feature[]): MapExtent | null => {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (coordinates: unknown): void => {
    if (isPosition(coordinates)) {
      const [x, y] = coordinates;
      west = Math.min(west, x);
      south = Math.min(south, y);
      east = Math.max(east, x);
      north = Math.max(north, y);
      return;
    }
    if (Array.isArray(coordinates)) coordinates.forEach(visit);
  };

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "GeometryCollection")
      geometry.geometries.forEach((inner) =>
        visit("coordinates" in inner ? inner.coordinates : null),
      );
    else visit(geometry.coordinates);
  }

  return west === Infinity ? null : [west, south, east, north];
};
