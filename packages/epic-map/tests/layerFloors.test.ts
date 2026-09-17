import { describe, expect, it } from "vitest";
import {
  layersBelowFloor,
  type LayerFloor,
} from "@/components/Layers/layerFloors";

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
