import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import {
  drawMeasure,
  formatArea,
  formatDistance,
  lineLength,
  polygonArea,
  segmentLengths,
  type MeasureShape,
} from "@/components/MapTools/measure";
import { MEASURE_CLOSING_COLOR } from "@/utils/config";
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

describe("formatArea", () => {
  it.each([
    [0, "0 m²"],
    [4.3, "4 m²"],
    [4_321, "4,300 m²"],
    [98_765, "99,000 m²"],
    [794_682, "790,000 m²"],
    [999_600, "1 km²"],
    [6_190_000, "6.2 km²"],
    [11_917_752, "12 km²"],
    [99_400_000, "99 km²"],
    [123_456_789, "123 km²"],
    [999_400_000, "999 km²"],
    [1_234_567_890, "1,230 km²"],
    [12_345_678_901, "12,300 km²"],
  ])("rounds %d m² to %s", (squareMetres, shown) => {
    expect(formatArea(squareMetres)).toBe(shown);
  });
});

describe("polygonArea", () => {
  // 0.01 degrees on a side: about 1,112 m by 715 m.
  const square: [number, number][] = [
    [-123, 50],
    [-123, 50.01],
    [-122.99, 50.01],
    [-122.99, 50],
  ];

  it("measures the area inside the points, either way round", () => {
    expect(polygonArea(square)).toBeCloseTo(794_682, 0);
    expect(polygonArea([...square].reverse())).toBeCloseTo(794_682, 0);
  });

  it("is nothing short of three points", () => {
    expect(polygonArea(square.slice(0, 2))).toBe(0);
  });
});

describe("drawMeasure", () => {
  const triangle: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];
  const vertices = triangle.map((coordinates) => ["point", { type: "Point", coordinates }]);

  // A loaded map with nothing drawn yet, so everything goes to addSource and addLayer.
  const draw = (shape: MeasureShape, preview: [number, number][] | null = null) => {
    const addSource = vi.fn();
    const addLayer = vi.fn();
    const map = {
      getStyle: () => ({}),
      getSource: () => undefined,
      addSource,
      addLayer,
    } as unknown as MapLibreMap;
    drawMeasure(map, triangle, preview, shape);
    const { data } = addSource.mock.calls[0][1] as { data: FeatureCollection };
    const layers = addLayer.mock.calls.map(
      ([layer]) => layer as { id: string; paint: Record<string, unknown> },
    );
    return {
      data,
      parts: data.features.map(({ properties, geometry }) => [properties?.part, geometry]),
      layers,
      paint: (part: string) => layers.find(({ id }) => id.endsWith(`measure-${part}`))!.paint,
    };
  };

  // MAP-105's specs, in the gold selection colour rather than its orange.
  const GOLD = "#FCBA19";

  it("draws the line dashed in gold at 2px", () => {
    expect(draw("open").paint("line")).toMatchObject({
      "line-color": GOLD,
      "line-width": 2,
      "line-dasharray": [2, 2],
    });
  });

  it("draws each vertex as a gold dot with a white edge", () => {
    expect(draw("open").paint("point")).toEqual({
      "circle-radius": 5,
      "circle-color": GOLD,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    });
  });

  it("dims only the segment out to the cursor", () => {
    const { data, paint } = draw("open", [triangle[2], [2, 2]]);
    const lines = data.features.filter(({ properties }) => properties?.part === "line");

    expect(lines.map(({ properties }) => properties)).toEqual([
      { part: "line" },
      { part: "line", preview: true },
    ]);
    expect(paint("line")["line-opacity"]).toEqual(["case", ["has", "preview"], 0.6, 1]);
  });

  it("fills a closed area in gold at 0.3", () => {
    expect(draw("closed").paint("fill")).toEqual({ "fill-color": GOLD, "fill-opacity": 0.3 });
  });

  it("joins a closed shape back to Point 1 and fills it", () => {
    const ring = [...triangle, triangle[0]];
    expect(draw("closed").parts).toEqual([
      ["fill", { type: "Polygon", coordinates: [ring] }],
      ["line", { type: "LineString", coordinates: ring }],
      ...vertices,
    ]);
  });

  it("dashes the edge from the last point back to Point 1 in grey while it can close", () => {
    const { parts, layers } = draw("closable");
    expect(parts).toEqual([
      ["closing", { type: "LineString", coordinates: [triangle[2], triangle[0]] }],
      ["line", { type: "LineString", coordinates: triangle }],
      ...vertices,
    ]);
    expect(layers.find(({ id }) => id.endsWith("measure-closing"))).toMatchObject({
      filter: ["==", ["get", "part"], "closing"],
      paint: { "line-color": MEASURE_CLOSING_COLOR, "line-dasharray": [2, 2] },
    });
  });

  it("leaves an open line open and unfilled", () => {
    expect(draw("open").parts).toEqual([
      ["line", { type: "LineString", coordinates: triangle }],
      ...vertices,
    ]);
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

  it("closes only a shape of three points or more, and ends it", () => {
    expect(measureReducer(add(undefined, [0, 0], [0, 1]), { type: "close" }).closed).toBe(false);

    const closed = measureReducer(add(undefined, [0, 0], [0, 1], [1, 1]), { type: "close" });
    expect(closed).toMatchObject({ closed: true, finished: true });
    expect(add(closed, [1, 0])).toBe(closed);
  });

  it("does not close a finished line", () => {
    const done = measureReducer(add(undefined, [0, 0], [0, 1], [1, 1]), { type: "finish" });
    expect(measureReducer(done, { type: "close" })).toBe(done);
  });

  it("clears back to nothing", () => {
    const done = measureReducer(add(undefined, [0, 0], [0, 1]), { type: "finish" });
    expect(measureReducer(done, { type: "clear" })).toBe(INITIAL_MEASURE);
  });
});
