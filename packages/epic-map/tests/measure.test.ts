import { describe, expect, it } from "vitest";
import { formatDistance, lineLength, segmentLengths } from "@/components/MapTools/measure";
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
