import { describe, expect, it } from "vitest";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { ProjectWork } from "@/api/useProjects";
import {
  formatWorkDate,
  glyphForType,
  keepProjectsOnTop,
  parseProjectImageId,
  projectIconImage,
  projectIdAt,
  projectImageId,
  PROJECTS_LAYER_ID,
  projectSortKey,
  workMetaLine,
  workStateBadge,
} from "@/components/Projects/projectUtils";

describe("glyphForType", () => {
  it.each([
    ["Mines", "terrain"],
    ["Energy - Electricity", "flash_on"],
    ["Energy-Electricity", "flash_on"],
    ["Energy - Petroleum & Natural Gas", "local_gas_station"],
    ["Energy - Oil and Natural Gas", "local_gas_station"],
    ["Water Management", "water_drop"],
    ["Transportation", "commute"],
    ["Industrial", "factory"],
    ["Waste Disposal", "delete"],
    ["Tourist Destination Resort", "beach_access"],
    ["Tourist Destination Resorts", "beach_access"],
    ["Other", "category"],
  ])("draws %s as %s", (typeName, glyph) => {
    expect(glyphForType(typeName)).toBe(glyph);
  });

  it.each([null, undefined, "", "Something New"])(
    "draws an unknown type (%s) as Other",
    (typeName) => {
      expect(glyphForType(typeName)).toBe("category");
    },
  );
});

describe("project image ids", () => {
  it("round-trips every glyph, colour and state", () => {
    const id = projectImageId("local_gas_station", true, "selected");

    expect(id).toBe("epic-project-local_gas_station-wip-selected");
    expect(parseProjectImageId(id)).toEqual({
      glyph: "local_gas_station",
      hasWorksInProgress: true,
      state: "selected",
    });
  });

  it.each([
    "epic-wms-anything",
    "epic-project-unknown-wip-default",
    "epic-project-terrain-maybe-default",
    "epic-project-terrain-idle-huge",
    "basemap-icon",
  ])("leaves %s to whoever owns it", (id) => {
    expect(parseProjectImageId(id)).toBeNull();
  });
});

const evaluate = (
  expression: ExpressionSpecification,
  id: number,
  hasWorksInProgress: boolean,
) => {
  const compiled = createExpression(expression, "layers[0].layout");
  if (compiled.result !== "success") throw new Error("invalid expression");
  return compiled.value.evaluate({ zoom: 6 }, {
    type: "Point",
    id,
    properties: { glyph: "terrain", hasWorksInProgress },
    geometry: [],
  } as never);
};

describe("project dot expressions", () => {
  it("asks for the image matching colour and selection", () => {
    expect(evaluate(projectIconImage(null), 1, true)).toBe(
      projectImageId("terrain", true, "default"),
    );
    expect(evaluate(projectIconImage(null), 1, false)).toBe(
      projectImageId("terrain", false, "default"),
    );
    expect(evaluate(projectIconImage(1), 1, false)).toBe(
      projectImageId("terrain", false, "selected"),
    );
    expect(evaluate(projectIconImage(2), 1, true)).toBe(
      projectImageId("terrain", true, "default"),
    );
  });

  it("draws green over blue, and the selected dot over both", () => {
    const blue = evaluate(projectSortKey(9), 1, false);
    const green = evaluate(projectSortKey(9), 2, true);
    const selectedBlue = evaluate(projectSortKey(3), 3, false);

    expect(green).toBeGreaterThan(blue);
    expect(selectedBlue).toBeGreaterThan(green);
  });
});

const fakeMap = (order: string[], hits: unknown[] = []) => {
  const moved: string[] = [];
  const map = {
    getLayersOrder: () => order,
    moveLayer: (id: string) => moved.push(id),
    getLayer: (id: string) => (order.includes(id) ? { id } : undefined),
    queryRenderedFeatures: () => hits,
  };
  return { map: map as unknown as MapLibreMap, moved };
};

describe("keepProjectsOnTop", () => {
  it("moves the dots above a layer added after them", () => {
    const { map, moved } = fakeMap([PROJECTS_LAYER_ID, "epic-wms-x"]);
    keepProjectsOnTop(map);
    expect(moved).toEqual([PROJECTS_LAYER_ID]);
  });

  it("leaves them alone when already on top, or not drawn", () => {
    expect(fakeMap(["epic-wms-x", PROJECTS_LAYER_ID]).moved).toEqual([]);
    const notDrawn = fakeMap(["epic-wms-x"]);
    keepProjectsOnTop(notDrawn.map);
    expect(notDrawn.moved).toEqual([]);
  });
});

describe("projectIdAt", () => {
  it("prefers the green dot, the one drawn on top", () => {
    const { map } = fakeMap(
      [PROJECTS_LAYER_ID],
      [
        { id: 4, properties: { hasWorksInProgress: false } },
        { id: 5, properties: { hasWorksInProgress: true } },
      ],
    );
    expect(projectIdAt(map, [0, 0])).toBe(5);
  });

  it("is null off a dot, or before the dots are drawn", () => {
    expect(projectIdAt(fakeMap([PROJECTS_LAYER_ID]).map, [0, 0])).toBeNull();
    expect(projectIdAt(fakeMap([]).map, [0, 0])).toBeNull();
  });
});

describe("workStateBadge", () => {
  it.each([
    ["COMPLETED", "Completed", "#d8eafd", "#053662"],
    ["IN_PROGRESS", "In Progress", "#f6fff8", "#42814a"],
    ["TERMINATED", "Terminated", "#f4e1e2", "#ce3e39"],
    ["WITHDRAWN", "Withdrawn", "#f4e1e2", "#ce3e39"],
    ["SUSPENDED", "Suspended", "#f4e1e2", "#ce3e39"],
    ["CLOSED", "Closed", "#f3f2f1", "#353433"],
  ])("colours %s", (state, label, fill, border) => {
    expect(workStateBadge(state)).toEqual({ label, fill, border });
  });

  it.each([null, undefined, "", "  ", "ON_HOLD"])(
    "falls back to Completed for %s",
    (state) => {
      expect(workStateBadge(state)).toEqual(workStateBadge("COMPLETED"));
    },
  );
});

const work = (overrides: Partial<ProjectWork>): ProjectWork => ({
  id: 1,
  title: "Amendment",
  state: "COMPLETED",
  phaseName: "Amendment Review (Typical)",
  decisionDate: "2023-10-10T07:00:00+00:00",
  description: null,
  ...overrides,
});

describe("workMetaLine", () => {
  it("shows the phase for an active work", () => {
    expect(workMetaLine(work({ state: "IN_PROGRESS" }))).toBe(
      "Amendment Review (Typical)",
    );
    expect(workMetaLine(work({ state: "SUSPENDED" }))).toBe(
      "Amendment Review (Typical)",
    );
  });

  it("shows the decision and its date for a decided work", () => {
    expect(workMetaLine(work({}))).toBe("Decision · 10 Oct 2023");
    expect(workMetaLine(work({ state: "TERMINATED" }))).toBe(
      "Decision · 10 Oct 2023",
    );
  });

  it("falls back to the phase when a decided work has no date", () => {
    expect(workMetaLine(work({ decisionDate: null }))).toBe(
      "Amendment Review (Typical)",
    );
    expect(workMetaLine(work({ decisionDate: null, phaseName: null }))).toBeNull();
  });
});

describe("formatWorkDate", () => {
  it("formats in BC time", () => {
    // 03:00 UTC on the 11th is still the 10th in Vancouver.
    expect(formatWorkDate("2023-10-11T03:00:00+00:00")).toBe("10 Oct 2023");
    expect(formatWorkDate("2024-09-05T19:00:00+00:00")).toBe("5 Sep 2024");
  });

  it("is null for something that is not a date", () => {
    expect(formatWorkDate("soon")).toBeNull();
  });
});
