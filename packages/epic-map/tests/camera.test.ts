import { describe, expect, it } from "vitest";
import { LngLat } from "maplibre-gl";
import { constrainToBC } from "@/utils/camera";
import {
  CENTER_BOUNDS,
  DEFAULT_EXTENT,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/utils/config";
import type { MapExtent } from "@/types";

const mercatorX = (lng: number): number => (lng + 180) / 360;
const mercatorY = (lat: number): number =>
  (180 -
    (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
  360;

// The zoom MapLibre's fitBounds lands on, for its 512px tiles.
const fitZoom = (
  [west, south, east, north]: MapExtent,
  width: number,
  height: number,
  padding = 0,
): number => {
  const boundsWidth = (mercatorX(east) - mercatorX(west)) * 512;
  const boundsHeight = (mercatorY(south) - mercatorY(north)) * 512;
  return Math.log2(
    Math.min(
      (width - 2 * padding) / boundsWidth,
      (height - 2 * padding) / boundsHeight,
    ),
  );
};

const [west, south, east, north] = DEFAULT_EXTENT;
const BC_CENTER = new LngLat((west + east) / 2, (south + north) / 2);

describe("constrainToBC", () => {
  it.each([
    ["a 1280×720 laptop", 1280, 720, 0],
    ["a 1920×1080 desktop", 1920, 1080, 0],
    ["a 1920×600 strip", 1920, 600, 0],
    ["a portrait 768×1024 iPad", 768, 1024, 0],
    ["the 590×308 import preview", 590, 308, 24],
  ])("lets the whole province fit on %s", (_, width, height, padding) => {
    const zoom = fitZoom(DEFAULT_EXTENT, width, height, padding);

    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    // No zooming in to fill the screen, which is what maxBounds did.
    expect(constrainToBC(BC_CENTER, zoom).zoom).toBe(zoom);
  });

  it("leaves a camera already over BC where it is", () => {
    const { center } = constrainToBC(new LngLat(-123.4, 48.4), 10);
    expect(center.toArray()).toEqual([-123.4, 48.4]);
  });

  it("pulls a centre panned off past the box back to its edge", () => {
    const [boxWest, , , boxNorth] = CENTER_BOUNDS;
    const { center } = constrainToBC(new LngLat(-170, 75), 6);
    expect(center.toArray()).toEqual([boxWest, boxNorth]);
  });

  it("holds the zoom inside the map's range", () => {
    expect(constrainToBC(BC_CENTER, 1).zoom).toBe(MIN_ZOOM);
    expect(constrainToBC(BC_CENTER, 22).zoom).toBe(MAX_ZOOM);
  });
});
