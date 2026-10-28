import { describe, expect, it, vi } from "vitest";
import {
  componentSpecIds,
  eaoSpecFilters,
  FOOTPRINT_SPEC_IDS,
  footprintDrawnIds,
  footprintTrackIdAt,
} from "@/components/Layers/eaoVisibility";
import {
  type LocalLayerStyle,
  setLocalVectorLayerFilters,
} from "@/components/Layers/layerUtils";
import { WIDGET_ID_PREFIX } from "@/utils/config";
import {
  EAO_OBJECT_NAME,
  isAlwaysDrawn,
  localLayerId,
  PIP_OBJECT_NAME,
} from "@/utils/localLayers";

/** The EAO style as map-api serves it: footprints, then everything else. */
const style: LocalLayerStyle = {
  source: { minZoom: null, maxZoom: 12 },
  layers: [
    {
      id: "footprint-fill",
      type: "fill",
      sourceLayer: "eao_project_data",
      filter: ["==", ["get", "style_category"], "footprint"],
      paint: {},
    },
    {
      id: "footprint-outline",
      type: "line",
      sourceLayer: "eao_project_data",
      filter: ["==", ["get", "style_category"], "footprint"],
      paint: {},
    },
    {
      id: "component-fill",
      type: "fill",
      sourceLayer: "eao_project_data",
      filter: ["all", ["==", ["geometry-type"], "Polygon"]],
      paint: {},
    },
    {
      id: "line",
      type: "line",
      sourceLayer: "eao_project_data",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {},
    },
    {
      id: "point",
      type: "circle",
      sourceLayer: "eao_project_data",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {},
    },
  ],
};

const LAYER_ID = localLayerId(EAO_OBJECT_NAME);
/** Spelled as layerUtils spells it, so the test cannot drift from the prefix. */
const drawnId = (specId: string) =>
  `${WIDGET_ID_PREFIX}local-${LAYER_ID}-${specId}`;

describe("what the EAO layer draws", () => {
  it("separates the footprint specs from the rest", () => {
    expect(FOOTPRINT_SPEC_IDS).toEqual(["footprint-fill", "footprint-outline"]);
    expect(componentSpecIds(style)).toEqual([
      "component-fill",
      "line",
      "point",
    ]);
  });

  it("draws footprints only for the projects whose dots are drawn", () => {
    const filters = eaoSpecFilters(style, [205, 368], [], []);

    for (const id of FOOTPRINT_SPEC_IDS) {
      expect(filters[id]).toEqual([
        "in",
        ["get", "track_id"],
        ["literal", [205, 368]],
      ]);
    }
  });

  it("draws no components until a panel reveals them", () => {
    const filters = eaoSpecFilters(style, [205], [], []);

    for (const id of componentSpecIds(style)) {
      // A filter that cannot match, rather than a hidden layer: the components
      // come back by changing the reveal condition alone.
      expect(filters[id]).toEqual([
        "all",
        ["in", ["get", "track_id"], ["literal", [205]]],
        ["in", ["get", "feature_id"], ["literal", []]],
      ]);
    }
  });

  it("draws the components a panel reveals, by feature id", () => {
    const filters = eaoSpecFilters(style, [205], ["{A1}", "{A2}"], []);

    for (const id of componentSpecIds(style)) {
      expect(filters[id]).toContainEqual([
        "in",
        ["get", "feature_id"],
        ["literal", ["{A1}", "{A2}"]],
      ]);
    }
  });

  it("leaves footprints to the filter bar whatever is revealed", () => {
    const filters = eaoSpecFilters(style, [205], ["{A1}"], []);

    expect(filters["footprint-fill"]).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", [205]],
    ]);
  });

  it("takes off a footprint the panel switched off", () => {
    const filters = eaoSpecFilters(style, [205], [], ["{F1}"]);

    for (const id of FOOTPRINT_SPEC_IDS) {
      expect(filters[id]).toEqual([
        "all",
        ["in", ["get", "track_id"], ["literal", [205]]],
        ["!", ["in", ["get", "feature_id"], ["literal", ["{F1}"]]]],
      ]);
    }
  });

  it("filters components by project as well as by their reveal", () => {
    // So that revealing them cannot leave a component behind when its project
    // has been filtered out - the dot, the footprint and the components go
    // together.
    const filters = eaoSpecFilters(style, [205, 368], [], []);
    const projectFilter = ["in", ["get", "track_id"], ["literal", [205, 368]]];

    for (const id of componentSpecIds(style)) {
      expect(filters[id]).toContainEqual(projectFilter);
    }
  });

  it("draws nothing where the filter bar matches no project", () => {
    const filters = eaoSpecFilters(style, [], [], []);

    expect(filters["footprint-fill"]).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", []],
    ]);
  });
});

describe("applying a filter without losing the style's own", () => {
  const fakeMap = () => {
    const set: Record<string, unknown> = {};
    return {
      set,
      isStyleLoaded: () => true,
      getLayer: (id: string) => ({ id }),
      setFilter: (id: string, filter: unknown) => {
        set[id] = filter;
      },
    };
  };

  it("keeps the spec's filter and adds the client's", () => {
    const map = fakeMap();

    setLocalVectorLayerFilters(
      map as never,
      LAYER_ID,
      style,
      eaoSpecFilters(style, [205], [], []),
    );

    const applied = Object.values(map.set)[0] as unknown[];
    expect(applied[0]).toBe("all");
    // The style's own reason for the spec, unchanged.
    expect(applied[1]).toEqual(["==", ["get", "style_category"], "footprint"]);
    // The client's, on top of it.
    expect(applied[2]).toEqual(["in", ["get", "track_id"], ["literal", [205]]]);
  });

  it("leaves a spec alone where nothing is added for it", () => {
    const map = fakeMap();

    setLocalVectorLayerFilters(map as never, LAYER_ID, style, {});

    expect(Object.values(map.set)[0]).toEqual([
      "==",
      ["get", "style_category"],
      "footprint",
    ]);
  });
});

describe("clicking a footprint", () => {
  const drawn = [
    drawnId("footprint-fill"),
    drawnId("footprint-outline"),
    drawnId("component-fill"),
  ];

  const fakeMap = (hits: object[]) => ({
    isStyleLoaded: () => true,
    getStyle: () => ({ layers: drawn.map((id) => ({ id })) }),
    getLayer: (id: string) => ({ id }),
    queryRenderedFeatures: vi.fn(() => hits),
  });

  it("is tested against the footprint specs only", () => {
    const map = fakeMap([]);

    expect(footprintDrawnIds(map as never)).toEqual([
      drawnId("footprint-fill"),
      drawnId("footprint-outline"),
    ]);
  });

  it("answers with the Track project under the point", () => {
    const map = fakeMap([{ properties: { track_id: 205 } }]);

    expect(footprintTrackIdAt(map as never, { x: 1, y: 1 } as never)).toBe(205);
  });

  it("reads a track_id the tile encoded as text", () => {
    const map = fakeMap([{ properties: { track_id: "368" } }]);

    expect(footprintTrackIdAt(map as never, { x: 1, y: 1 } as never)).toBe(368);
  });

  it("answers null where no footprint was hit", () => {
    const map = fakeMap([]);

    expect(footprintTrackIdAt(map as never, { x: 1, y: 1 } as never)).toBeNull();
  });

  it("skips a feature carrying no usable id", () => {
    const map = fakeMap([{ properties: {} }, { properties: { track_id: 44 } }]);

    expect(footprintTrackIdAt(map as never, { x: 1, y: 1 } as never)).toBe(44);
  });
});

describe("the default view on load", () => {
  it("draws the footprints whatever the panel says", () => {
    // A footprint is how a project is represented, not a layer to opt into:
    // there is no row to star, unstar or switch off.
    expect(isAlwaysDrawn(EAO_OBJECT_NAME)).toBe(true);
  });

  it("leaves a reference layer to the panel", () => {
    // PIP is starred, listed and toggled, so the panel decides.
    expect(isAlwaysDrawn(PIP_OBJECT_NAME)).toBe(false);
  });

  it("treats an unknown layer as the panel's", () => {
    expect(isAlwaysDrawn("SOMETHING.ELSE")).toBe(false);
    expect(isAlwaysDrawn(null)).toBe(false);
  });

  it("draws components only once something reveals them", () => {
    // The footprint is the default representation; components wait for the
    // project panel.
    const filters = eaoSpecFilters(style, [205], [], []);
    for (const id of componentSpecIds(style)) {
      expect(filters[id]).toBeDefined();
    }
    expect(filters["footprint-fill"]).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", [205]],
    ]);
  });

  it("shows nothing for a project the filter bar has hidden", () => {
    // The dot and the footprint are driven by one list, so they cannot
    // diverge: no project visible, no footprint drawn.
    const filters = eaoSpecFilters(style, [], [], []);
    expect(filters["footprint-fill"]).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", []],
    ]);
  });
});
