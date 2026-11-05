import { describe, expect, it } from "vitest";
import { unionBounds } from "@/utils/geo";

describe("unionBounds", () => {
  it("covers every extent given", () => {
    expect(
      unionBounds([
        [-124, 50, -123.5, 50.5],
        [-123, 49, -123, 49],
      ]),
    ).toEqual([-124, 49, -123, 50.5]);
  });

  it("skips the unknown ones", () => {
    expect(unionBounds([null, [-123, 49, -122, 50]])).toEqual([-123, 49, -122, 50]);
  });

  it("is null when none is known", () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([null])).toBeNull();
  });
});
