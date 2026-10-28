import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  carryWidgetLayers,
  hideLocalVectorLayer,
  localDrawnIds,
  setLocalVectorLayerLineWidth,
  setLocalVectorLayerOpacity,
  showLocalHighlight,
  showLocalVectorLayer,
  type LocalLayerStyle,
} from "@/components/Layers/layerUtils";
import { localTileUrl, LOCAL_TILE_MAX_ZOOM } from "@/utils/config";

const LAYER_ID = "pip-consultation-areas";
const OBJECT_NAME = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";
const API_BASE = "https://map-api.example.invalid/api";

/**
 * A style shaped like the one map-api returns, translated from the .lyrx.
 * Two classes rather than 299 - the count is not what is being asserted.
 *
 * One layer, because the consultation areas are outlines. The polygon case
 * below is what checks that a longer list keeps its order.
 */
const style: LocalLayerStyle = {
  source: { minZoom: 6, maxZoom: LOCAL_TILE_MAX_ZOOM },
  layers: [
    {
      id: "line",
      type: "line",
      sourceLayer: "pip_consultation_areas",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "cnsltn_area_name"],
          "Adams Lake Indian Band",
          "#FF7F7F",
          "Bridge River ",
          "#005CE6",
          "#000000",
        ],
        "line-width": 4,
        "line-opacity": 0.8,
      },
    },
  ],
};

/**
 * What a component layer looks like: a translucent fill under its own outline,
 * with points as a circle. Maria's table specifies all three per category.
 */
const polygonStyle: LocalLayerStyle = {
  source: { minZoom: null, maxZoom: LOCAL_TILE_MAX_ZOOM },
  layers: [
    {
      id: "fill",
      type: "fill",
      sourceLayer: "eao_components",
      filter: ["==", ["get", "component_class"], "footprint"],
      paint: { "fill-color": "#0072B2", "fill-opacity": 0.3 },
    },
    {
      id: "line",
      type: "line",
      sourceLayer: "eao_components",
      paint: { "line-color": "#0072B2", "line-width": 1.6 },
    },
    {
      id: "point",
      type: "circle",
      sourceLayer: "eao_components_point",
      paint: { "circle-radius": 5, "circle-stroke-width": 1.5 },
    },
  ],
};

interface AddedLayer {
  id: string;
  source: string;
  type: string;
  minzoom?: number;
  filter?: unknown;
  "source-layer"?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

interface AddedSource {
  id: string;
  type: string;
  tiles?: string[];
  minzoom?: number;
  maxzoom?: number;
}

/** The basemap's own layers, so placement has something to be relative to. */
const BASEMAP_LAYERS = [
  { id: "background", type: "background" },
  { id: "roads", type: "line" },
  { id: "place-labels", type: "symbol" },
];

/**
 * The BC Basemap's order, reduced: placeholder labels before anything is
 * drawn. Searching forward for the first `symbol` finds index 0 and buries the
 * layer.
 */
const ESRI_ORDER_LAYERS = [
  { id: "placeholder-reserves-label", type: "symbol" },
  { id: "placeholder-lakes-label", type: "symbol" },
  { id: "lakes", type: "fill" },
  { id: "roads", type: "line" },
  { id: "provincial-boundary", type: "line" },
  { id: "city-labels", type: "symbol" },
  { id: "park-label-point", type: "circle" },
];

/**
 * Same shape as the harness in layerUtils.test.ts, recording the source spec by
 * id as well, because for a vector layer the source is half the assertion, and
 * the `before` argument, because draw order is the point of a layer list.
 */
const fakeMap = () => {
  const handlers = new Map<string, Set<() => void>>();
  const added: AddedLayer[] = [];
  const before: (string | undefined)[] = [];
  const sources: AddedSource[] = [];
  const visibility: { id: string; value: string }[] = [];
  const paint: { id: string; key: string; value: unknown }[] = [];
  const removed: string[] = [];

  const map = {
    isStyleLoaded: () => false,
    on: (event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
    },
    off: (event: string, handler: () => void) => {
      handlers.get(event)?.delete(handler);
    },
    getStyle: () => ({ layers: [...BASEMAP_LAYERS, ...added] }),
    getLayer: (id: string) => added.find((spec) => spec.id === id),
    getSource: (id: string) => sources.find((spec) => spec.id === id),
    addSource: (id: string, spec: Omit<AddedSource, "id">) =>
      sources.push({ id, ...spec }),
    addLayer: (spec: AddedLayer, beforeId?: string) => {
      added.push(spec);
      before.push(beforeId);
    },
    setLayoutProperty: (id: string, _key: string, value: string) =>
      visibility.push({ id, value }),
    setPaintProperty: (id: string, key: string, value: unknown) =>
      paint.push({ id, key, value }),
    removeLayer: (id: string) => {
      removed.push(id);
      const at = added.findIndex((spec) => spec.id === id);
      if (at !== -1) added.splice(at, 1);
    },
    removeSource: (id: string) => {
      const at = sources.findIndex((spec) => spec.id === id);
      if (at !== -1) sources.splice(at, 1);
    },
  };

  return {
    map: map as unknown as MapLibreMap,
    added,
    before,
    sources,
    visibility,
    paint,
    removed,
    fire: (event: string) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler();
    },
  };
};

const show = (
  harness: ReturnType<typeof fakeMap>,
  which: LocalLayerStyle = style,
) => {
  showLocalVectorLayer(
    harness.map,
    LAYER_ID,
    localTileUrl(API_BASE, OBJECT_NAME),
    which,
  );
  harness.fire("styledata");
};

describe("showLocalVectorLayer", () => {
  it("waits for the style, like every other map mutation", () => {
    const harness = fakeMap();

    showLocalVectorLayer(
      harness.map,
      LAYER_ID,
      localTileUrl(API_BASE, OBJECT_NAME),
      style,
    );
    expect(harness.added).toHaveLength(0);

    harness.fire("styledata");
    expect(harness.added).toHaveLength(1);
  });

  it("adds a vector source and a line layer", () => {
    const harness = fakeMap();
    show(harness);

    expect(harness.sources[0].type).toBe("vector");
    expect(harness.added[0].type).toBe("line");
  });

  it("prefixes both ids so a basemap switch carries them", () => {
    // MapSurface's carryWidgetLayers copies forward only what starts with the
    // widget's prefix; anything else vanishes when the user changes basemap.
    const harness = fakeMap();
    show(harness);

    expect(harness.sources[0].id.startsWith("epic-")).toBe(true);
    expect(harness.added[0].id.startsWith("epic-")).toBe(true);
  });

  it("keeps the tile placeholders for MapLibre to fill in", () => {
    const harness = fakeMap();
    show(harness);

    expect(harness.sources[0].tiles?.[0]).toBe(
      `${API_BASE}/local/layers/${OBJECT_NAME}/tiles/{z}/{x}/{y}`,
    );
  });

  it("passes the server's paint through untouched", () => {
    // The whole point of translating the .lyrx on the server is that the
    // widget does not get an opinion about what the layer looks like.
    const harness = fakeMap();
    show(harness);

    expect(harness.added[0].paint).toEqual(style.layers[0].paint);
    expect(harness.added[0]["source-layer"]).toBe("pip_consultation_areas");
  });

  it("carries a class value with a trailing space into the paint", () => {
    // 'Bridge River ' is the real warehouse value. If anything along the way
    // trimmed it the class would stop matching and that territory would fall
    // to the default black.
    const harness = fakeMap();
    show(harness);

    const colours = (harness.added[0].paint?.["line-color"] ?? []) as unknown[];
    expect(colours).toContain("Bridge River ");
  });

  it("gates the source as well as the layer on the style's floor", () => {
    // The server builds every tile on request, so a tile asked for below the
    // zoom the layer draws at is work spent on something nobody sees.
    const harness = fakeMap();
    show(harness);

    expect(harness.sources[0].minzoom).toBe(6);
    expect(harness.sources[0].maxzoom).toBe(LOCAL_TILE_MAX_ZOOM);
    // The layer inherits the source's floor: the style document carries it once,
    // and gating both is what stops a tile being fetched AND drawn too far out.
    expect(harness.added[0].minzoom).toBe(6);
  });

  it("lets a layer start deeper than its source", () => {
    const harness = fakeMap();
    show(harness, {
      source: { minZoom: 6, maxZoom: LOCAL_TILE_MAX_ZOOM },
      layers: [
        { ...style.layers[0], id: "close-up", minZoom: 11 },
      ],
    });

    expect(harness.sources[0].minzoom).toBe(6);
    expect(harness.added[0].minzoom).toBe(11);
  });

  it("sets no floor at all when neither the source nor the layer has one", () => {
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect("minzoom" in harness.added[0]).toBe(false);
  });

  it("reveals an existing layer rather than adding it twice", () => {
    const harness = fakeMap();
    show(harness);
    show(harness);

    expect(harness.added).toHaveLength(1);
    expect(harness.visibility).toContainEqual({
      id: harness.added[0].id,
      value: "visible",
    });
  });

  it("draws every layer the style asks for, in order", () => {
    // A translucent polygon is a fill under its own outline. Getting them back
    // the other way round hides the outline under the neighbouring fill.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(harness.added.map((spec) => spec.type)).toEqual([
      "fill",
      "line",
      "circle",
    ]);
  });

  it("gives each layer of a set its own id", () => {
    const harness = fakeMap();
    show(harness, polygonStyle);

    const ids = harness.added.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(id.startsWith("epic-")).toBe(true));
  });

  it("shares one source across the whole set", () => {
    // Three layers over one set of tiles: the tile is fetched and parsed once.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(harness.sources).toHaveLength(1);
    expect(new Set(harness.added.map((spec) => spec.source)).size).toBe(1);
  });

  it("lets a layer name its own source-layer", () => {
    // A mixed-geometry layer carries points in a separate MVT layer.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(harness.added[2]["source-layer"]).toBe("eao_components_point");
  });

  it("carries a filter through when the style sets one", () => {
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(harness.added[0].filter).toEqual([
      "==",
      ["get", "component_class"],
      "footprint",
    ]);
  });

  it("omits the filter entirely when the style sets none", () => {
    // Passing filter: undefined is not the same as not passing it; MapLibre
    // validates the key if it is present.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect("filter" in harness.added[1]).toBe(false);
  });

  it("inserts below the basemap's labels", () => {
    // A translucent fill drawn over place names makes them unreadable, which is
    // the one thing a boundary overlay must not do.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(harness.before).toEqual([
      "place-labels",
      "place-labels",
      "place-labels",
    ]);
  });

  it("draws above the ground when the basemap labels before it draws", () => {
    // The bug this file missed, because the fixture above shared the
    // assumption the code made.
    const harness = fakeMap();
    BASEMAP_LAYERS.splice(0, BASEMAP_LAYERS.length, ...ESRI_ORDER_LAYERS);
    try {
      show(harness, polygonStyle);

      expect(harness.before).toEqual([
        "city-labels",
        "city-labels",
        "city-labels",
      ]);
    } finally {
      BASEMAP_LAYERS.splice(
        0,
        BASEMAP_LAYERS.length,
        { id: "background", type: "background" },
        { id: "roads", type: "line" },
        { id: "place-labels", type: "symbol" },
      );
    }
  });

  it("appends when the basemap has no labels at all", () => {
    const harness = fakeMap();
    BASEMAP_LAYERS.splice(2, 1);
    try {
      show(harness, polygonStyle);
      expect(harness.before).toEqual([undefined, undefined, undefined]);
    } finally {
      BASEMAP_LAYERS.push({ id: "place-labels", type: "symbol" });
    }
  });
});

describe("hideLocalVectorLayer", () => {
  it("hides rather than removes, so the parsed tiles survive", () => {
    const harness = fakeMap();
    show(harness);

    hideLocalVectorLayer(harness.map, LAYER_ID);
    harness.fire("styledata");

    expect(harness.sources).toHaveLength(1);
    expect(harness.visibility.at(-1)).toEqual({
      id: harness.added[0].id,
      value: "none",
    });
  });

  it("hides every layer of a set, not just the first", () => {
    // Leaving one behind is the bug worth testing for: an outline with no fill
    // reads as a different layer rather than as a mistake.
    const harness = fakeMap();
    show(harness, polygonStyle);

    hideLocalVectorLayer(harness.map, LAYER_ID);
    harness.fire("styledata");

    const hidden = harness.visibility.filter((one) => one.value === "none");
    expect(hidden.map((one) => one.id)).toEqual(
      harness.added.map((spec) => spec.id),
    );
  });

  it("does nothing for a layer that was never drawn", () => {
    const harness = fakeMap();

    hideLocalVectorLayer(harness.map, LAYER_ID);
    harness.fire("styledata");

    expect(harness.visibility).toHaveLength(0);
  });
});

describe("localTileUrl", () => {
  it("does not double the slash when the base url has a trailing one", () => {
    expect(localTileUrl("https://example.invalid/api/", OBJECT_NAME)).toBe(
      `https://example.invalid/api/local/layers/${OBJECT_NAME}/tiles/{z}/{x}/{y}`,
    );
  });
});

describe("setLocalVectorLayerOpacity", () => {
  /** Draw the layer, then move the slider. */
  const slide = (percent: number, which: LocalLayerStyle = polygonStyle) => {
    const harness = fakeMap();
    show(harness, which);
    harness.paint.length = 0;
    setLocalVectorLayerOpacity(harness.map, LAYER_ID, which, percent);
    harness.fire("styledata");
    return harness;
  };

  it("scales the style's own opacity rather than replacing it", () => {
    // The symbology is the .lyrx's: a fill drawn at 0.3 is 0.3 at the top of
    // the slider and half that at the middle. Setting the percent directly
    // would lose the translucency overlapping territories need.
    const harness = slide(50);

    expect(harness.paint).toEqual([
      { id: "epic-local-pip-consultation-areas-fill", key: "fill-opacity", value: 0.15 },
      { id: "epic-local-pip-consultation-areas-line", key: "line-opacity", value: 0.5 },
      { id: "epic-local-pip-consultation-areas-point", key: "circle-opacity", value: 0.5 },
    ]);
  });

  it("treats a layer with no opacity of its own as fully opaque", () => {
    // Neither carries a *-opacity, so the slider is all of it.
    const harness = slide(100);
    const byId = new Map(harness.paint.map((call) => [call.key, call.value]));

    expect(byId.get("line-opacity")).toBe(1);
    expect(byId.get("circle-opacity")).toBe(1);
    // The fill still keeps the .lyrx's 0.3 at the top of the slider.
    expect(byId.get("fill-opacity")).toBeCloseTo(0.3);
  });

  it("names the opacity property for each layer's own type", () => {
    // MapLibre ignores a property that does not belong to the type, so this
    // wrong is a slider that silently does nothing.
    expect(slide(40).paint.map((call) => call.key)).toEqual([
      "fill-opacity",
      "line-opacity",
      "circle-opacity",
    ]);
  });

  it("leaves a layer that is not on the map alone", () => {
    const harness = fakeMap();
    setLocalVectorLayerOpacity(harness.map, LAYER_ID, polygonStyle, 50);
    harness.fire("styledata");

    expect(harness.paint).toEqual([]);
  });
});

describe("setLocalVectorLayerLineWidth", () => {
  /** Draw the layer, then move the slider. */
  const slide = (pixels: number, which: LocalLayerStyle = style) => {
    const harness = fakeMap();
    show(harness, which);
    harness.paint.length = 0;
    setLocalVectorLayerLineWidth(harness.map, LAYER_ID, which, pixels);
    harness.fire("styledata");
    return harness;
  };

  it("strokes the width the slider asks for, not a scaling of the style's", () => {
    // Assigned, unlike the opacity above, so the px shown is the px drawn.
    expect(slide(1.5).paint).toEqual([
      {
        id: "epic-local-pip-consultation-areas-line",
        key: "line-width",
        value: 1.5,
      },
    ]);
  });

  it("leaves a fill and a circle alone", () => {
    // Only the slider's own property changes; the .lyrx keeps the rest.
    expect(slide(2, polygonStyle).paint).toEqual([
      {
        id: "epic-local-pip-consultation-areas-line",
        key: "line-width",
        value: 2,
      },
    ]);
  });

  it("leaves a layer that is not on the map alone", () => {
    const harness = fakeMap();
    setLocalVectorLayerLineWidth(harness.map, LAYER_ID, style, 2);
    harness.fire("styledata");

    expect(harness.paint).toEqual([]);
  });
});

describe("showLocalHighlight", () => {
  const highlight = {
    layerId: LAYER_ID,
    sourceLayer: "pip_consultation_areas",
    keyProperty: "cnsltn_area_guid",
    keys: ["0123456789abcdef0123456789abcdef"],
  };

  /** Draw the layer, then highlight one of its features. */
  const pick = () => {
    const harness = fakeMap();
    show(harness);
    harness.added.length = 0;
    harness.before.length = 0;
    showLocalHighlight(harness.map, highlight);
    harness.fire("styledata");
    return harness;
  };

  it("outlines the one feature, matched on the key in the tile", () => {
    const harness = pick();

    expect(harness.added.map((spec) => spec.id)).toEqual([
      "epic-highlight-local-fill",
      "epic-highlight-local-line",
    ]);
    for (const spec of harness.added) {
      // The filter is the whole of "which feature": wrong highlights
      // nothing, absent highlights the lot.
      expect(spec.filter).toEqual([
        "in",
        ["get", "cnsltn_area_guid"],
        ["literal", ["0123456789abcdef0123456789abcdef"]],
      ]);
      expect(spec["source-layer"]).toBe("pip_consultation_areas");
    }
  });

  it("outlines every feature it is given", () => {
    const harness = fakeMap();
    show(harness);
    harness.added.length = 0;
    showLocalHighlight(harness.map, { ...highlight, keys: ["a", "b"] });
    harness.fire("styledata");

    expect(harness.added[0].filter).toEqual([
      "in",
      ["get", "cnsltn_area_guid"],
      ["literal", ["a", "b"]],
    ]);
  });

  it("replaces the previous highlight rather than stacking on it", () => {
    const harness = pick();
    // `added` is what getLayer answers from, so clearing it here would hide
    // the first highlight and pass for the wrong reason.
    harness.removed.length = 0;

    showLocalHighlight(harness.map, { ...highlight, keys: ["f".repeat(32)] });
    harness.fire("styledata");

    expect(harness.removed).toEqual([
      "epic-highlight-local-fill",
      "epic-highlight-local-line",
    ]);
    // The two it removed, replaced by two carrying the new key.
    expect(harness.added.map((spec) => spec.id)).toEqual([
      "epic-highlight-local-fill",
      "epic-highlight-local-line",
    ]);
    expect(harness.added[0].filter).toEqual([
      "in",
      ["get", "cnsltn_area_guid"],
      ["literal", ["f".repeat(32)]],
    ]);
  });

  it("does nothing when the layer's tiles are not on the map", () => {
    // Nothing to filter, and addLayer against a missing source throws.
    const harness = fakeMap();
    showLocalHighlight(harness.map, highlight);
    harness.fire("styledata");

    expect(harness.added).toEqual([]);
  });
});

describe("localDrawnIds", () => {
  it("names every map layer drawn for one hosted layer", () => {
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(localDrawnIds(harness.map, LAYER_ID)).toEqual([
      "epic-local-pip-consultation-areas-fill",
      "epic-local-pip-consultation-areas-line",
      "epic-local-pip-consultation-areas-point",
    ]);
  });

  it("does not claim another hosted layer's rows", () => {
    // A click is tested against these, so matching widely identifies a
    // feature of the wrong layer.
    const harness = fakeMap();
    show(harness, polygonStyle);

    expect(localDrawnIds(harness.map, "some-other-layer")).toEqual([]);
  });

  it("is empty before the layer is drawn", () => {
    expect(localDrawnIds(fakeMap().map, LAYER_ID)).toEqual([]);
  });
});

describe("the insertion point, with the widget's own layers on the map", () => {
  /**
   * The BC Basemap's order plus a widget raster already drawn. A catalogue
   * layer appends above the labels, so counting it finds the widget's raster
   * as the last ground layer and puts this above every place name.
   */
  const ESRI_WITH_WIDGET = [
    { id: "placeholder-label", type: "symbol" },
    { id: "lakes", type: "fill" },
    { id: "roads", type: "line" },
    { id: "city-labels", type: "symbol" },
    { id: "epic-wms-catalogue-1", type: "raster" },
  ];

  it("measures the basemap only, not what the widget has already drawn", () => {
    const harness = fakeMap();
    BASEMAP_LAYERS.splice(0, BASEMAP_LAYERS.length, ...ESRI_WITH_WIDGET);
    try {
      show(harness, polygonStyle);

      // Still under the basemap's labels.
      expect(harness.before).toEqual([
        "city-labels",
        "city-labels",
        "city-labels",
      ]);
    } finally {
      BASEMAP_LAYERS.splice(
        0,
        BASEMAP_LAYERS.length,
        { id: "background", type: "background" },
        { id: "roads", type: "line" },
        { id: "place-labels", type: "symbol" },
      );
    }
  });
});

describe("carryWidgetLayers", () => {
  const widget = (id: string, type: string) => ({ id: `epic-${id}`, type });

  const previous = {
    sources: {
      "epic-local-src-pip": { type: "vector" },
      "basemap-source": { type: "vector" },
    },
    layers: [
      { id: "basemap-roads", type: "line" },
      widget("local-pip-line", "line"),
      widget("wms-catalogue-1", "raster"),
    ],
  };

  /** The incoming basemap, in the BC Basemap's label-first order. */
  const next = {
    sources: { "new-basemap-source": { type: "vector" } },
    layers: [
      { id: "placeholder-label", type: "symbol" },
      { id: "lakes", type: "fill" },
      { id: "new-roads", type: "line" },
      { id: "city-labels", type: "symbol" },
    ],
  };

  const carry = () =>
    carryWidgetLayers(
      previous as never,
      next as never,
    ) as unknown as { sources: Record<string, unknown>; layers: { id: string }[] };

  it("keeps the widget's layers across the switch", () => {
    // setStyle replaces the style wholesale, so without this they vanish.
    expect(carry().layers.map((layer) => layer.id)).toContain(
      "epic-local-pip-line",
    );
  });

  it("splices them into the incoming basemap's label block", () => {
    // Appending puts them over the place names; the old first-`symbol` search
    // put them at index 0, under the whole basemap.
    expect(carry().layers.map((layer) => layer.id)).toEqual([
      "placeholder-label",
      "lakes",
      "new-roads",
      "epic-local-pip-line",
      "epic-wms-catalogue-1",
      "city-labels",
    ]);
  });

  it("carries the widget's sources and leaves the basemap's behind", () => {
    const sources = Object.keys(carry().sources);

    expect(sources).toContain("epic-local-src-pip");
    expect(sources).toContain("new-basemap-source");
    expect(sources).not.toContain("basemap-source");
  });

  it("returns the incoming style untouched on the first load", () => {
    // No previous style means nothing to carry.
    expect(carryWidgetLayers(undefined as never, next as never)).toBe(next);
  });
});
