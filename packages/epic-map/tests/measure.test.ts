import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  drawMeasure,
  formatDistance,
  lineLength,
  segmentLengths,
  type LngLatPoint,
} from "@/components/MapTools/measure";
import { HIGHLIGHT_CASING_COLOR } from "@/utils/config";
import { INITIAL_MEASURE, measureReducer } from "@/components/MapTools/MeasureContext";

describe("formatDistance", () => {
  it.each([
    [0, "0 km"],
    [0.4, "0 km"],
    [4.3, "4 m"],
    [345, "350 m"],
    [999, "1 km"],
    [1234, "1.2 km"],
    [2000, "2 km"],
    [23456, "23 km"],
    [1234567, "1,200 km"],
  ])("rounds %d m to %s", (metres, shown) => {
    expect(formatDistance(metres)).toBe(shown);
  });
});

describe("line lengths", () => {
  const points: [number, number][] = [
    [-123, 50],
    [-123, 50.01],
    [-123, 50.03],
  ];

  it("measures each segment along the ground", () => {
    const [first, second] = segmentLengths(points);
    expect(first).toBeCloseTo(1112, 0);
    expect(second).toBeCloseTo(2224, 0);
  });

  it("totals the segments", () => {
    expect(lineLength(points)).toBeCloseTo(3336, 0);
    expect(lineLength(points.slice(0, 1))).toBe(0);
  });
});

describe("measureReducer", () => {
  const add = (state = INITIAL_MEASURE, ...points: [number, number][]) =>
    points.reduce((next, point) => measureReducer(next, { type: "add", point }), state);

  it("finishes only a line of two points or more", () => {
    expect(measureReducer(add(undefined, [0, 0]), { type: "finish" }).finished).toBe(false);
    expect(measureReducer(add(undefined, [0, 0], [0, 1]), { type: "finish" }).finished).toBe(true);
  });

  it("neither adds to nor undoes a finished line", () => {
    const done = measureReducer(add(undefined, [0, 0], [0, 1]), { type: "finish" });
    expect(add(done, [0, 2])).toBe(done);
    expect(measureReducer(done, { type: "undo" })).toBe(done);
  });

  it("clears back to nothing", () => {
    const done = measureReducer(add(undefined, [0, 0], [0, 1]), { type: "finish" });
    expect(measureReducer(done, { type: "clear" })).toBe(INITIAL_MEASURE);
  });
});

describe("the measured line on the map", () => {
  const ORANGE = "#E8833A";

  const draw = (points: LngLatPoint[], preview: LngLatPoint[] | null) => {
    const layers: { id: string; paint: Record<string, unknown> }[] = [];
    let data: FeatureCollection | undefined;
    const map = {
      getStyle: () => ({ layers: [] }),
      getSource: () => undefined,
      addSource: (_id: string, spec: { data: FeatureCollection }) => {
        data = spec.data;
      },
      addLayer: (layer: { id: string; paint: Record<string, unknown> }) =>
        layers.push(layer),
    };
    drawMeasure(map as unknown as MapLibreMap, points, preview);
    const paint = (part: string) =>
      layers.find(({ id }) => id.endsWith(`measure-${part}`))!.paint;
    return { paint, data: data! };
  };

  const A: LngLatPoint = [-123, 49];
  const B: LngLatPoint = [-122, 49];
  const C: LngLatPoint = [-121, 49];

  it("draws the line dashed in orange, not the navy of a project boundary", () => {
    const { paint } = draw([A, B], null);

    expect(paint("line")).toMatchObject({
      "line-color": ORANGE,
      "line-width": 2,
      "line-dasharray": [2, 2],
    });
    expect(paint("line")["line-color"]).not.toBe(HIGHLIGHT_CASING_COLOR);
  });

  it("draws each point as an orange dot with a white edge", () => {
    expect(draw([A], null).paint("point")).toEqual({
      "circle-radius": 5,
      "circle-color": ORANGE,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    });
  });

  it("dims only the segment out to the cursor", () => {
    const { paint, data } = draw([A, B], [B, C]);
    const opacity = paint("line")["line-opacity"];
    const [placed, preview] = data.features;

    expect(placed.properties).toEqual({ preview: false });
    expect(preview.properties).toEqual({ preview: true });
    expect(opacity).toEqual(["case", ["get", "preview"], 0.6, 1]);
  });
});
