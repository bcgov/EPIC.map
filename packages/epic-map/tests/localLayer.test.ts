import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  hideLocalVectorLayer,
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
  };

  return {
    map: map as unknown as MapLibreMap,
    added,
    before,
    sources,
    visibility,
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
