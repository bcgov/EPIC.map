import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import type {
  MetaDataByLayer,
  MetaDataFeature,
  MetaDataLayerResult,
} from "@/api/useMetaData";
import {
  boundsOutOfView,
  importedRows,
  NO_ATTRIBUTES,
  attributeLabel,
  attributeValue,
  clickBox,
  featureHeading,
  isOutOfView,
  EMPTY_VALUE,
  isLoading,
  featureCount,
  POPUP_MARGIN_PX,
  popupPlacement,
  NOTHING_HERE_TITLE,
  POPUP_LARGE_STEP_PX,
  POPUP_STEP_PX,
  popupTitle,
  selectableOptions,
  selectedOption,
  stepFor,
  steppedIndex,
  toRows,
  visibleRows,
} from "@/components/MetaData/metaDataUtils";
import { hideHighlight, showHighlight } from "@/components/Layers/layerUtils";
import { highlightTileUrl, wmsTileUrl } from "@/utils/config";

const layer = (name: string): AppliedLayer => ({
  id: `cat-${name}`,
  packageId: name,
  objectName: `WHSE_TEST.${name.toUpperCase()}`,
  name,
  lastUpdated: "",
  description: null,
  metadataUrl: "https://example.invalid",
  appliedId: 1,
  opacity: 100,
});

const feature: MetaDataFeature = {
  id: "WHSE_TEST.A.1",
  name: "Musqueam 2",
  properties: [{ name: "NAME", value: "A" }],
  geometry: { type: "Point", coordinates: [-123, 49] },
  bounds: [-123, 49, -123, 49],
};

/** One layer's row of a batch answer, as map-api sends it. */
const answer = (
  target: AppliedLayer,
  state: Pick<MetaDataLayerResult, "status" | "feature">,
): MetaDataLayerResult => ({
  objectName: target.objectName as string,
  error: state.status === "error" ? "The warehouse did not answer." : null,
  ...state,
});

/** The click's answers, keyed the way the hook hands them over. */
const answers = (...rows: MetaDataLayerResult[]): MetaDataByLayer =>
  Object.fromEntries(rows.map((row) => [row.objectName, row]));

const found = (target: AppliedLayer) =>
  answer(target, { status: "found", feature });
const empty = (target: AppliedLayer) =>
  answer(target, { status: "empty", feature: null });
const failed = (target: AppliedLayer) =>
  answer(target, { status: "error", feature: null });

describe("clickBox", () => {
  // A flat projection: a pixel is a hundredth of a degree, y grows southwards.
  const map = {
    unproject: ([x, y]: [number, number]) => ({ lng: x / 100, lat: -y / 100 }),
  };

  it("spans the tolerance either side of the click, west to east and south to north", () => {
    expect(clickBox(map, { x: 100, y: 200 }, 5)).toEqual([0.95, -2.05, 1.05, -1.95]);
  });

  it("rounds so that the same click makes the same cache key", () => {
    const jittery = {
      unproject: ([x, y]: [number, number]) => ({
        lng: x / 3,
        lat: y / 7,
      }),
    };
    const [west] = clickBox(jittery, { x: 10, y: 10 }, 1);
    expect(west.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });
});

describe("rows", () => {
  const [a, b, c] = [layer("a"), layer("b"), layer("c")];

  it("is loading while a layer of the click has no answer yet", () => {
    expect(isLoading(toRows([a, b], answers(found(a))))).toBe(true);
    expect(isLoading(toRows([a, b], answers(found(a), failed(b))))).toBe(false);
  });

  it("answers each layer by name, whatever order they came back in", () => {
    const rows = toRows([a, b], answers(failed(b), found(a)));
    expect(rows.map((row) => [row.layer.name, row.status])).toEqual([
      ["a", "found"],
      ["b", "error"],
    ]);
  });

  it("reads the whole click failing as every layer failing", () => {
    const rows = toRows([a, b], {}, { failed: true });
    expect(rows.map((row) => row.status)).toEqual(["error", "error"]);
    expect(isLoading(rows)).toBe(false);
  });

  it("lists layers with a feature and layers that failed, not layers with nothing", () => {
    const rows = visibleRows(toRows([a, b, c], answers(found(a), empty(b), failed(c))));
    expect(rows.map((row) => [row.layer.name, row.status])).toEqual([
      ["a", "found"],
      ["c", "error"],
    ]);
  });

  it("marks a failed row that is being retried", () => {
    const [row] = toRows([a], answers(failed(a)), {
      retrying: new Set([a.objectName as string]),
    });
    expect(row.status).toBe("error");
    expect(row.retrying).toBe(true);
  });

  it("selects the first feature that answered, skipping a failure above it", () => {
    const rows = visibleRows(toRows([a, b], answers(failed(a), found(b))));
    expect(selectedOption(rows, null)?.row.layer.name).toBe("b");
  });

  it("keeps the user's choice while it is listed, and falls back when it is not", () => {
    const rows = visibleRows(toRows([a, b], answers(found(a), found(b))));
    const pick = { layerId: b.id, featureKey: feature.id as string };
    expect(selectedOption(rows, pick)?.row.layer.name).toBe("b");
    expect(
      selectedOption(rows, { layerId: "cat-gone", featureKey: "x" })?.row.layer
        .name,
    ).toBe("a");
  });

  it("lists a layer that failed as a row of its own, which can be selected", () => {
    // Selecting it is what shows why it failed, and the Retry.
    const rows = visibleRows(toRows([a], answers(failed(a))));
    expect(selectableOptions(rows)).toHaveLength(1);
    expect(selectedOption(rows, null)?.row.status).toBe("error");
    expect(selectedOption(rows, null)?.feature.records).toEqual([]);
  });

  it("does not open on the failure when another layer answered", () => {
    const rows = visibleRows(toRows([a, b], answers(failed(a), found(b))));
    expect(selectedOption(rows, null)?.row.layer.name).toBe("b");
  });

  it("has nothing to select when no layer has anything here", () => {
    expect(selectedOption(visibleRows(toRows([a], answers(empty(a)))), null)).toBeNull();
  });

  it("counts features rather than layers, across every layer listed", () => {
    const rows = visibleRows(toRows([a, b], answers(found(a), found(b))));
    expect(featureCount(rows)).toBe(2);
  });

  it("counts a layer that failed, which is a row the user can click", () => {
    expect(
      featureCount(visibleRows(toRows([a, b], answers(found(a), failed(b))))),
    ).toBe(2);
  });
});

describe("featureHeading", () => {
  const option = (name: string | null) => {
    const [row] = toRows(
      [layer("Indian Reserves")],
      answers(
        answer(layer("Indian Reserves"), {
          status: "found",
          feature: { ...feature, name },
        }),
      ),
    );
    return { row, feature: row.features[0] };
  };

  it("is what the layer's own map labels the feature", () => {
    expect(featureHeading(option("Musqueam 2"))).toBe("Musqueam 2");
  });

  it("stands the layer's name in when the style labels nothing", () => {
    expect(featureHeading(option(null))).toBe("Indian Reserves");
    expect(featureHeading(option(""))).toBe("Indian Reserves");
  });
});

describe("isOutOfView", () => {
  const viewport = { width: 800, height: 600 };
  const box = (left: number, top: number, size: number) => ({
    left,
    top,
    right: left + size,
    bottom: top + size,
  });

  it("is in view when it is on screen and big enough to make out", () => {
    expect(isOutOfView(box(100, 100, 200), viewport, 24)).toBe(false);
  });

  it("is out of view when the feature is a speck at this zoom", () => {
    expect(isOutOfView(box(400, 300, 3), viewport, 24)).toBe(true);
  });

  it("keeps a long thin feature, which is small only across", () => {
    const thin = { left: 100, top: 300, right: 700, bottom: 302 };
    expect(isOutOfView(thin, viewport, 24)).toBe(false);
  });

  it("is out of view when the feature is off screen", () => {
    expect(isOutOfView(box(-500, 100, 200), viewport, 24)).toBe(true);
    expect(isOutOfView(box(900, 100, 200), viewport, 24)).toBe(true);
    expect(isOutOfView(box(100, 700, 200), viewport, 24)).toBe(true);
  });

  it("keeps a feature larger than the screen, which is all around the user", () => {
    const huge = { left: -900, top: -900, right: 1700, bottom: 1500 };
    expect(isOutOfView(huge, viewport, 24)).toBe(false);
  });
});

describe("popupTitle", () => {
  it("reads 'Identifying…' while any layer is still out", () => {
    expect(popupTitle(true, 0)).toBe("Identifying…");
  });

  it("counts the features shown, and pluralises on them", () => {
    expect(popupTitle(false, 1)).toBe("1 feature at this point");
    expect(popupTitle(false, 3)).toBe("3 features at this point");
  });

  it("says so when no layer had anything, rather than counting nothing", () => {
    expect(popupTitle(false, 0)).toBe(NOTHING_HERE_TITLE);
  });

  it("counts what has answered while the rest are still out", () => {
    const [one, two] = [layer("a"), layer("b")];
    const rows = visibleRows(toRows([one, two], answers(found(one))));
    expect(popupTitle(true, featureCount(rows))).toBe("1 feature at this point");
  });
});

describe("stepFor", () => {
  it("moves the popup the way the arrow points", () => {
    expect(stepFor("ArrowLeft", false)).toEqual({ dx: -POPUP_STEP_PX, dy: 0 });
    expect(stepFor("ArrowRight", false)).toEqual({ dx: POPUP_STEP_PX, dy: 0 });
    expect(stepFor("ArrowUp", false)).toEqual({ dx: 0, dy: -POPUP_STEP_PX });
    expect(stepFor("ArrowDown", false)).toEqual({ dx: 0, dy: POPUP_STEP_PX });
  });

  it("covers more ground with shift held", () => {
    expect(stepFor("ArrowRight", true)).toEqual({ dx: POPUP_LARGE_STEP_PX, dy: 0 });
  });

  it("leaves every other key alone", () => {
    expect(stepFor("Enter", false)).toBeNull();
    expect(stepFor("Home", true)).toBeNull();
  });
});

describe("steppedIndex", () => {
  it("moves with the arrows and stops at either end", () => {
    expect(steppedIndex("ArrowDown", 0, 3)).toBe(1);
    expect(steppedIndex("ArrowDown", 2, 3)).toBe(2);
    expect(steppedIndex("ArrowUp", 0, 3)).toBe(0);
    expect(steppedIndex("Home", 2, 3)).toBe(0);
    expect(steppedIndex("End", 0, 3)).toBe(2);
  });

  it("leaves every other key alone", () => {
    expect(steppedIndex("Enter", 0, 3)).toBeNull();
    expect(steppedIndex("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("attributes", () => {
  it("reads warehouse column names as words", () => {
    expect(attributeLabel("FEATURE_AREA_SQM")).toBe("Feature Area Sqm");
    expect(attributeLabel("OBJECTID")).toBe("Objectid");
  });

  it("shows a value as text, and an absent one as a dash", () => {
    expect(attributeValue(1772693.6708)).toBe("1772693.6708");
    expect(attributeValue("Y")).toBe("Y");
    expect(attributeValue(true)).toBe("Yes");
    expect(attributeValue(null)).toBe(EMPTY_VALUE);
    expect(attributeValue("")).toBe(EMPTY_VALUE);
    expect(attributeValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe("popupPlacement", () => {
  const container = { width: 1000, height: 800 };

  it("opens to the right of the click when it fits", () => {
    const placement = popupPlacement({ x: 100, y: 200 }, container, 320);
    expect(placement.left).toBeGreaterThan(100);
    expect(placement.width).toBe(320);
  });

  it("opens to the left of a click near the right edge", () => {
    const placement = popupPlacement({ x: 900, y: 200 }, container, 320);
    expect(placement.left + placement.width).toBeLessThan(900);
  });

  it("opens higher for a click near the bottom, never above the top", () => {
    expect(popupPlacement({ x: 100, y: 790 }, container, 320).top).toBeLessThan(790 - 200);
    expect(popupPlacement({ x: 100, y: 0 }, container, 320).top).toBe(POPUP_MARGIN_PX);
  });

  it("narrows to a map narrower than the popup", () => {
    const placement = popupPlacement({ x: 100, y: 100 }, { width: 240, height: 800 }, 320);
    expect(placement.width).toBe(240 - 2 * POPUP_MARGIN_PX);
    expect(placement.left).toBe(POPUP_MARGIN_PX);
  });
});

describe("highlight", () => {
  const fakeMap = () => {
    const layers = new Map<string, { type: string }>();
    const sources = new Map<string, { type: string; tiles?: string[] }>();
    const map = {
      isStyleLoaded: () => true,
      getLayer: (id: string) => layers.get(id),
      getSource: (id: string) => sources.get(id),
      addSource: (id: string, spec: { type: string; tiles?: string[] }) =>
        sources.set(id, spec),
      addLayer: (spec: { id: string; type: string }) => layers.set(spec.id, spec),
      removeLayer: (id: string) => layers.delete(id),
      removeSource: (id: string) => sources.delete(id),
    };
    return { map: map as unknown as MapLibreMap, layers, sources };
  };

  it("draws a feature from its geometry when map-api carried it", () => {
    const { map, layers, sources } = fakeMap();
    showHighlight(map, { objectName: "WHSE_TEST.A", featureId: "x", geometry: feature.geometry });

    expect([...sources.values()].map((source) => source.type)).toEqual(["geojson"]);
    expect([...layers.values()].map((spec) => spec.type)).toEqual([
      "fill",
      "line",
      "line",
      "circle",
    ]);
  });

  it("draws a heavy feature by id through the warehouse's tiles", () => {
    const { map, layers, sources } = fakeMap();
    showHighlight(map, { objectName: "WHSE_TEST.A", featureId: "WHSE_TEST.A.7", geometry: null });

    const [source] = [...sources.values()];
    expect(source.type).toBe("raster");
    expect(source.tiles).toEqual([highlightTileUrl("WHSE_TEST.A", "WHSE_TEST.A.7")]);
    expect([...layers.values()].map((spec) => spec.type)).toEqual(["raster"]);
  });

  it("draws nothing for a feature with neither", () => {
    const { map, layers } = fakeMap();
    showHighlight(map, { objectName: "WHSE_TEST.A", featureId: null, geometry: null });
    expect(layers.size).toBe(0);
  });

  it("replaces the previous highlight, and hides without a trace", () => {
    const { map, layers, sources } = fakeMap();
    showHighlight(map, { objectName: "WHSE_TEST.A", featureId: null, geometry: feature.geometry });
    showHighlight(map, { objectName: "WHSE_TEST.A", featureId: "WHSE_TEST.A.7", geometry: null });
    expect([...layers.values()].map((spec) => spec.type)).toEqual(["raster"]);

    hideHighlight(map);
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });

  it("asks the warehouse for just the one feature, under the highlight style", () => {
    const url = new URL(
      highlightTileUrl("WHSE_TEST.A", "WHSE_TEST.A.Prince George").replace(
        "{bbox-epsg-3857}",
        "0,0,1,1",
      ),
    );
    expect(url.searchParams.get("FEATUREID")).toBe("WHSE_TEST.A.Prince George");
    expect(url.searchParams.get("SLD_BODY")).toContain("<Name>pub:WHSE_TEST.A</Name>");
    expect(url.href.startsWith(wmsTileUrl("WHSE_TEST.A").split("&BBOX")[0])).toBe(true);
  });
});

describe("importedRows", () => {
  const roads = { id: "roads", name: "Roads" };
  const parks = { id: "parks", name: "Parks" };
  const feature = (id: number, properties: Record<string, unknown> | null) => ({
    type: "Feature" as const,
    id,
    geometry: { type: "Point" as const, coordinates: [-123.37, 48.42] },
    properties,
  });

  it("lists every feature hit, under its own layer, in the order they were hit", () => {
    const rows = importedRows(
      [
        { layerId: "parks", featureId: 2 },
        { layerId: "roads", featureId: 7 },
        { layerId: "parks", featureId: 3 },
      ],
      [roads, parks],
      (_layerId, featureId) => feature(Number(featureId), { ID: featureId }),
    );

    expect(rows.map((row) => row.layer.id)).toEqual(["parks", "roads"]);
    expect(rows[0].features.map((one) => one.key)).toEqual(["2", "3"]);
    expect(rows[0].features[0].records[0].attributes).toEqual([
      { label: "Id", value: 2 },
    ]);
  });

  it("folds a feature reported twice over a tile seam into one", () => {
    const [row] = importedRows(
      [
        { layerId: "roads", featureId: 7 },
        { layerId: "roads", featureId: 7 },
      ],
      [roads],
      (_layerId, featureId) => feature(Number(featureId), { ID: featureId }),
    );

    expect(row.features).toHaveLength(1);
  });

  it("reads attributes from the layer's own data, with their bounds", () => {
    const [row] = importedRows(
      [{ layerId: "roads", featureId: 7 }],
      [roads],
      () => feature(7, { SURFACE: "gravel" }),
    );

    expect(row.status).toBe("found");
    expect(row.features[0].bounds).toEqual([-123.37, 48.42, -123.37, 48.42]);
  });

  it("falls back to the map's copy when the layer's data has no such feature", () => {
    const [row] = importedRows(
      [{ layerId: "roads", featureId: undefined, rendered: feature(0, { A: 1 }) }],
      [roads],
      () => null,
    );

    expect(row.features[0].records[0].attributes).toEqual([
      { label: "A", value: 1 },
    ]);
  });

  it("lists a feature with no attributes, for the popup to say so", () => {
    const [row] = importedRows(
      [{ layerId: "roads", featureId: 7 }],
      [roads],
      () => feature(7, null),
    );

    expect(row.features[0].records[0].attributes).toEqual([]);
  });

  it("drops a hit on a layer it was not given", () => {
    expect(
      importedRows([{ layerId: "gone", featureId: 1 }], [roads], () => null),
    ).toEqual([]);
  });

  it("says a feature has no metadata in the design's words", () => {
    expect(NO_ATTRIBUTES).toBe("No metadata for this feature.");
  });
});

describe("boundsOutOfView", () => {
  /**
   * A map that projects degrees to pixels by a fixed scale, in a known
   * viewport. `project` is the only thing boundsOutOfView adds over
   * isOutOfView, which is tested above on pixel boxes directly.
   */
  const fakeMap = (
    project: (lngLat: [number, number]) => { x: number; y: number },
    size = { width: 800, height: 600 },
  ) =>
    ({
      project,
      getContainer: () => ({
        clientWidth: size.width,
        clientHeight: size.height,
      }),
    }) as unknown as MapLibreMap;

  // A degree is ten pixels, and latitude grows upwards while y grows down.
  const tenPixelsPerDegree = ([lng, lat]: [number, number]) => ({
    x: lng * 10,
    y: -lat * 10,
  });

  it("is false without a map or without bounds", () => {
    // Nothing has been measured, so nothing is off screen: the caller shows
    // the feature rather than offering to zoom to it.
    expect(boundsOutOfView(null, [0, 0, 1, 1])).toBe(false);
    expect(boundsOutOfView(fakeMap(tenPixelsPerDegree), null)).toBe(false);
  });

  it("is false for a feature filling the middle of the view", () => {
    // 20 degrees across at ten pixels each: 200px in an 800x600 container.
    expect(
      boundsOutOfView(fakeMap(tenPixelsPerDegree), [10, -40, 30, -20]),
    ).toBe(false);
  });

  it("is true for a feature off the side of the view", () => {
    // Projects to x 2000..2200, past the container's 800.
    expect(
      boundsOutOfView(fakeMap(tenPixelsPerDegree), [200, -40, 220, -20]),
    ).toBe(true);
  });

  it("is true for a feature too small to see", () => {
    // One degree is ten pixels, under the 24 a feature needs to be worth
    // looking at - the case a bounds check on screen position alone misses.
    expect(
      boundsOutOfView(fakeMap(tenPixelsPerDegree), [10, -20, 11, -19]),
    ).toBe(true);
  });

  it("does not depend on which corner projects to the larger pixel", () => {
    // North is a smaller y than south, so the projected corners arrive with
    // top and bottom the other way round. Taking them as given would make
    // every box negative-height and so "too small".
    const inverted = ([lng, lat]: [number, number]) => ({
      x: -lng * 10,
      y: lat * 10,
    });

    expect(boundsOutOfView(fakeMap(inverted), [-30, 20, -10, 40])).toBe(false);
  });
});
