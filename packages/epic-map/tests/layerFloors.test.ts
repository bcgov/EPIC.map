import { describe, expect, it } from "vitest";
import {
  layersBelowFloor,
  localStyleFloor,
  type LayerFloor,
  type LocalLayerStyle,
} from "@/components/Layers/layerUtils";
import {
  isBeyondMapZoom,
  LOCAL_TILE_MAX_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/utils/config";

// Real published floors: parks draw from z5, reserves z8, lakes z11.
const floors: LayerFloor[] = [
  { id: "parks", floor: 5 },
  { id: "reserves", floor: 8 },
  { id: "lakes", floor: 11 },
];

/** Zooms a gesture actually delivers: one `zoom` event per animation frame. */
const sweep = (from: number, to: number, step = 0.05) => {
  const zooms: number[] = [];
  const delta = to > from ? step : -step;
  for (
    let zoom = from;
    delta > 0 ? zoom <= to : zoom >= to;
    zoom += delta
  ) {
    zooms.push(zoom);
  }
  return zooms;
};

describe("layersBelowFloor", () => {
  it("names the layers the current zoom cannot draw", () => {
    const empty = new Set<string>();

    expect([...layersBelowFloor(floors, 12, empty)]).toEqual([]);
    expect([...layersBelowFloor(floors, 9, empty)]).toEqual(["lakes"]);
    expect([...layersBelowFloor(floors, 6, empty)]).toEqual([
      "reserves",
      "lakes",
    ]);
    expect([...layersBelowFloor(floors, 4, empty)]).toEqual([
      "parks",
      "reserves",
      "lakes",
    ]);
  });

  it("changes identity only when the zoom crosses a floor", () => {
    /*
    The cost that matters. Every row in the panel reads this through context, so
    one new Set is one re-render of the whole list. A sweep from z12 to z3
    delivers ~180 frames and crosses three floors, so three is the budget - not
    one hundred and eighty.
    */
    let current: ReadonlySet<string> = new Set();
    let identityChanges = 0;

    const zooms = sweep(12, 3);
    for (const zoom of zooms) {
      const next = layersBelowFloor(floors, zoom, current);
      if (next !== current) identityChanges += 1;
      current = next;
    }

    expect(zooms.length).toBeGreaterThan(150);
    expect(identityChanges).toBe(3);
    expect([...current]).toEqual(["parks", "reserves", "lakes"]);
  });

  it("holds identity across a gesture that crosses nothing", () => {
    // Panning and fine zoom adjustment well inside one band: no work at all.
    let current: ReadonlySet<string> = layersBelowFloor(floors, 9, new Set());
    const before = current;

    for (const zoom of sweep(9.9, 8.1)) {
      current = layersBelowFloor(floors, zoom, current);
    }

    expect(current).toBe(before);
  });

  it("settles to nothing hidden once every floor is cleared", () => {
    let current: ReadonlySet<string> = layersBelowFloor(floors, 3, new Set());
    expect([...current]).toEqual(["parks", "reserves", "lakes"]);

    for (const zoom of sweep(3, 14)) {
      current = layersBelowFloor(floors, zoom, current);
    }

    expect([...current]).toEqual([]);
  });
});

describe("isBeyondMapZoom", () => {
  it("tells a floor the map can reach from one it cannot", () => {
    // A layer published from 1:50,000 draws at z13, well inside the map.
    expect(isBeyondMapZoom(13)).toBe(false);
    // The furthest the map goes still counts as reachable.
    expect(isBeyondMapZoom(MAX_ZOOM)).toBe(false);
    // Past it there is no gesture that brings the layer on screen, so the row
    // must not offer to zoom there.
    expect(isBeyondMapZoom(MAX_ZOOM + 1)).toBe(true);
  });
});

describe("localStyleFloor", () => {
  /** A hosted layer's style as map-api returns it, with the floors varied. */
  const style = (
    source: number | null,
    ...specFloors: (number | null | undefined)[]
  ): LocalLayerStyle => ({
    source: { minZoom: source, maxZoom: LOCAL_TILE_MAX_ZOOM },
    layers: specFloors.map((minZoom, index) => ({
      id: `spec-${index}`,
      type: "line",
      sourceLayer: "pip_consultation_areas",
      minZoom,
      paint: {},
    })),
  });

  it("reads the floor the .lyrx put on the source", () => {
    // PIP: one outline layer, gated at 1:6,000,000, which is zoom 6.
    expect(localStyleFloor(style(6, null))).toBe(6);
  });

  it("takes a spec's own floor where it draws deeper than the source", () => {
    expect(localStyleFloor(style(6, 9))).toBe(9);
  });

  it("takes the shallowest spec, which is where the layer first appears", () => {
    // A fill from z9 over an outline from z6: something is drawn at z6.
    expect(localStyleFloor(style(6, 9, null))).toBe(6);
  });

  it("holds a spec at the source's floor, under which there is no tile", () => {
    // The source stops the fetch, so a spec asking for z4 draws nothing there.
    expect(localStyleFloor(style(6, 4))).toBe(6);
  });

  it("gives a layer with no limit the map's own floor", () => {
    // The footprints: drawn wherever the map goes, so nothing to prompt about.
    expect(localStyleFloor(style(null, null))).toBe(MIN_ZOOM);
  });

  it("falls back to the source for a style that draws nothing", () => {
    expect(localStyleFloor(style(6))).toBe(6);
    expect(localStyleFloor(style(null))).toBe(MIN_ZOOM);
  });
});
