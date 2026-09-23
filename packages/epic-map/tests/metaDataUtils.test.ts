import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import type { MetaDataFeature, MetaDataResult } from "@/api/useMetaData";
import {
  attributeLabel,
  attributeValue,
  clickBox,
  featureHeading,
  isOutOfView,
  EMPTY_VALUE,
  isLoading,
  POPUP_MARGIN_PX,
  popupPlacement,
  NOTHING_HERE_TITLE,
  POPUP_LARGE_STEP_PX,
  POPUP_STEP_PX,
  popupTitle,
  selectedRow,
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

/** Only the fields the helpers read off a query result. */
const result = (
  state: Partial<Pick<MetaDataResult, "isError" | "isPending" | "isFetching" | "data">>,
): MetaDataResult =>
  ({
    isError: false,
    isPending: false,
    isFetching: false,
    data: undefined,
    ...state,
  }) as MetaDataResult;

const found = result({ data: feature });
const empty = result({ data: null });
const failed = result({ isError: true });
const pending = result({ isPending: true, isFetching: true });

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

  it("is loading until every layer has answered once", () => {
    expect(isLoading(toRows([a, b], [found, pending]))).toBe(true);
    expect(isLoading(toRows([a, b], [found, failed]))).toBe(false);
  });

  it("lists layers with a feature and layers that failed, not layers with nothing", () => {
    const rows = visibleRows(toRows([a, b, c], [found, empty, failed]));
    expect(rows.map((row) => [row.layer.name, row.status])).toEqual([
      ["a", "found"],
      ["c", "error"],
    ]);
  });

  it("marks a failed row that is being retried", () => {
    const [row] = toRows([a], [result({ isError: true, isFetching: true })]);
    expect(row.status).toBe("error");
    expect(row.retrying).toBe(true);
  });

  it("selects the first layer that answered, skipping a failure above it", () => {
    const rows = visibleRows(toRows([a, b], [failed, found]));
    expect(selectedRow(rows, null)?.layer.name).toBe("b");
  });

  it("keeps the user's choice while it is listed, and falls back when it is not", () => {
    const rows = visibleRows(toRows([a, b], [found, found]));
    expect(selectedRow(rows, b.id)?.layer.name).toBe("b");
    expect(selectedRow(rows, "cat-gone")?.layer.name).toBe("a");
  });

  it("selects a failure when nothing else is listed, so its Retry shows", () => {
    const rows = visibleRows(toRows([a], [failed]));
    expect(selectedRow(rows, null)?.status).toBe("error");
  });

  it("has nothing to select when no layer has anything here", () => {
    expect(selectedRow(visibleRows(toRows([a], [empty])), null)).toBeNull();
  });
});

describe("featureHeading", () => {
  const row = (name: string | null) => ({
    layer: layer("Indian Reserves"),
    status: "found" as const,
    feature: { ...feature, name },
    retrying: false,
  });

  it("is what the layer's own map labels the feature", () => {
    expect(featureHeading(row("Musqueam 2"))).toBe("Musqueam 2");
  });

  it("stands the layer's name in when the style labels nothing", () => {
    expect(featureHeading(row(null))).toBe("Indian Reserves");
    expect(featureHeading(row(""))).toBe("Indian Reserves");
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

  it("counts the rows shown", () => {
    expect(popupTitle(false, 1)).toBe("1 layer at this point");
    expect(popupTitle(false, 3)).toBe("3 layers at this point");
  });

  it("says so when no layer had anything, rather than counting nothing", () => {
    expect(popupTitle(false, 0)).toBe(NOTHING_HERE_TITLE);
  });

  it("counts a layer that failed, which is a row like any other", () => {
    const rows = visibleRows(toRows([layer("a"), layer("b")], [found, failed]));
    expect(popupTitle(false, rows.length)).toBe("2 layers at this point");
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
