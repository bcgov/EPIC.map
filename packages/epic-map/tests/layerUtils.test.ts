import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  hideOutlineLayer,
  setOutlineLayerMaxZoom,
  setWmsLayerMinZoom,
  showOutlineLayer,
  showWmsLayer,
} from "@/components/Layers/layerUtils";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  OUTLINE_COLOR,
  outlineTileUrl,
  WMS_MAX_LAYER_ZOOM,
  WMS_MIN_ZOOM,
  WMS_TILE_SIZE_PX,
} from "@/utils/config";

const layer: CatalogueLayer = {
  id: "cat-0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  packageId: "0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  objectName: "WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES",
  name: "Indian Reserves",
  lastUpdated: "",
  description: null,
  metadataUrl: "https://example.invalid",
};

/**
 * Enough of a map to record what was added and to fire the two events the
 * helpers listen for. `isStyleLoaded` stays false throughout: that is the state
 * a map is in while the basemap's tiles and sprite are still downloading.
 */
const fakeMap = () => {
  const handlers = new Map<string, Set<() => void>>();
  const added: { id: string; minzoom?: number; maxzoom?: number }[] = [];
  const sources: { tiles?: string[]; tileSize?: number }[] = [];
  const zoomRanges: { id: string; minzoom: number; maxzoom: number }[] = [];
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
    // Realistic: a layer is findable only once it has been added, which is
    // what tells the "draw it" path from the "reveal it" one.
    getLayer: (id: string) => added.find((spec) => spec.id === id),
    setLayerZoomRange: (id: string, minzoom: number, maxzoom: number) =>
      zoomRanges.push({ id, minzoom, maxzoom }),
    getSource: () => undefined,
    addSource: (_id: string, spec: { tiles?: string[]; tileSize?: number }) =>
      sources.push(spec),
    addLayer: (spec: { id: string; minzoom?: number; maxzoom?: number }) =>
      added.push(spec),
    setLayoutProperty: (id: string, _key: string, value: string) =>
      visibility.push({ id, value }),
  };

  return {
    map: map as unknown as MapLibreMap,
    added,
    sources,
    zoomRanges,
    visibility,
    fire: (event: string) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler();
    },
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
  };
};

describe("showWmsLayer", () => {
  it("draws once the stylesheet is in place, before the tiles are", () => {
    const { map, added, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    expect(added).toHaveLength(0);

    fire("styledata");
    expect(added).toHaveLength(1);
  });

  it("draws on idle when styledata has already been and gone", () => {
    // The layers restored on page load arrive after the style is parsed, so
    // there is no styledata left to wait for. Without idle they never appear.
    const { map, added, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("idle");

    expect(added).toHaveLength(1);
  });

  it("draws once, and stops listening after it has", () => {
    const { map, added, fire, listeners } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");
    fire("idle");
    fire("styledata");

    expect(added).toHaveLength(1);
    expect(listeners("styledata")).toBe(0);
    expect(listeners("idle")).toBe(0);
  });

  it("adds the layer with the floor the panel reports against", () => {
    const { map, added, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");

    expect(added[0].minzoom).toBe(WMS_MIN_ZOOM);
  });
});

describe("WMS tile requests", () => {
  it("asks openmaps for exactly the pixels the tile grid expects", () => {
    const { map, sources, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");

    // Divergence here does not throw: the tiles simply render at the wrong
    // resolution, which reads as a blurry or doubled layer rather than a bug.
    const [source] = sources;
    expect(source.tileSize).toBe(WMS_TILE_SIZE_PX);
    expect(source.tiles?.[0]).toContain(
      `WIDTH=${WMS_TILE_SIZE_PX}&HEIGHT=${WMS_TILE_SIZE_PX}`,
    );
  });
});

describe("setWmsLayerMinZoom", () => {
  it("replaces the provisional floor with the layer's published one", () => {
    const { map, added, zoomRanges, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");
    expect(added[0].minzoom).toBe(WMS_MIN_ZOOM);

    setWmsLayerMinZoom(map, layer.id, 11);
    fire("styledata");

    expect(zoomRanges).toHaveLength(1);
    expect(zoomRanges[0].minzoom).toBe(11);
  });

  it("clears the floor for a layer that declares no scale limit", () => {
    const { map, zoomRanges, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");
    setWmsLayerMinZoom(map, layer.id, null);
    fire("styledata");

    expect(zoomRanges[0].minzoom).toBe(MIN_ZOOM);
  });

  it("keeps the layer drawn at full zoom", () => {
    const { map, zoomRanges, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    fire("styledata");
    setWmsLayerMinZoom(map, layer.id, 8);
    fire("styledata");

    // A layer is hidden at zooms at or above its maxzoom, so an upper bound of
    // MAX_ZOOM would blank every layer exactly when fully zoomed in.
    expect(zoomRanges[0].maxzoom).toBeGreaterThan(MAX_ZOOM);
    expect(zoomRanges[0].maxzoom).toBe(WMS_MAX_LAYER_ZOOM);
  });
});

describe("outlineTileUrl", () => {
  const url = outlineTileUrl(layer.objectName!);

  it("asks the warehouse for the layer's own geometry, styled by us", () => {
    expect(url).toContain(`LAYERS=pub:${layer.objectName}`);
    expect(url).toContain("SLD_BODY=");
    expect(decodeURIComponent(url)).toContain(
      `<Name>pub:${layer.objectName}</Name>`,
    );
  });

  it("carries a style that strokes and never fills", () => {
    const sld = decodeURIComponent(url);

    expect(sld).toContain(`<CssParameter name="stroke">${OUTLINE_COLOR}`);
    expect(sld).not.toContain("fill");
  });

  it("declares no scale limit, which is what lets the outline draw at all", () => {
    // The limit that hides the layer lives in its published style, so a style
    // of our own carrying none is the whole mechanism.
    expect(decodeURIComponent(url)).not.toContain("ScaleDenominator");
  });

  it("draws points as marks, and nothing else as one", () => {
    const sld = decodeURIComponent(url);

    // Without the geometry-type filter a PointSymbolizer also lands on every
    // polygon's centroid, which reads as noise over the outline itself.
    expect(sld).toContain("<ogc:Literal>*Point*</ogc:Literal>");
    expect(sld).toContain("<ElseFilter/>");
  });

  it("leaves MapLibre's placeholder intact and stays inside a GET", () => {
    expect(url).toContain("BBOX={bbox-epsg-3857}");
    expect(url.length).toBeLessThan(2048);
  });
});

describe("showOutlineLayer", () => {
  it("waits for the style, then adds one raster on the tile grid", () => {
    const { map, added, sources, fire } = fakeMap();

    showOutlineLayer(map, layer);
    expect(added).toHaveLength(0);

    fire("styledata");

    expect(sources).toHaveLength(1);
    expect(sources[0].tileSize).toBe(WMS_TILE_SIZE_PX);
    expect(added).toHaveLength(1);
  });

  it("starts on the provisional floor, so it cannot outlast an unknown one", () => {
    const { map, added, fire } = fakeMap();

    showOutlineLayer(map, layer);
    fire("styledata");

    // Whatever the layer's raster is gated on, the outline has to stop there.
    expect(added[0].maxzoom).toBe(WMS_MIN_ZOOM);
  });

  it("reveals the outline it has rather than adding a second", () => {
    const { map, added, visibility, fire } = fakeMap();

    showOutlineLayer(map, layer);
    fire("styledata");

    showOutlineLayer(map, layer);
    fire("styledata");

    expect(added).toHaveLength(1);
    expect(visibility).toEqual([{ id: added[0].id, value: "visible" }]);
  });

  it("gives the outline and the layer separate ids on the map", () => {
    // They coexist on one style and differ only by zoom range, so a collision
    // here would have one silently replacing the other.
    const { map, added, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    showOutlineLayer(map, layer);
    fire("styledata");

    expect(added).toHaveLength(2);
    expect(added[0].id).not.toBe(added[1].id);
  });
});

describe("setOutlineLayerMaxZoom", () => {
  it("hands over at the zoom the layer itself starts drawing", () => {
    const { map, added, zoomRanges, fire } = fakeMap();

    showOutlineLayer(map, layer);
    fire("styledata");

    setOutlineLayerMaxZoom(map, layer.id, 11);
    fire("styledata");

    expect(zoomRanges).toEqual([
      { id: added[0].id, minzoom: MIN_ZOOM, maxzoom: 11 },
    ]);
  });

  it("draws nothing for a layer that declares no limit", () => {
    // Such a layer draws at every zoom, so there is no zoom left to outline.
    // MapLibre renders nothing when maxzoom meets minzoom.
    const { map, added, zoomRanges, fire } = fakeMap();

    showOutlineLayer(map, layer);
    fire("styledata");

    setOutlineLayerMaxZoom(map, layer.id, null);
    fire("styledata");

    expect(zoomRanges).toEqual([
      { id: added[0].id, minzoom: MIN_ZOOM, maxzoom: MIN_ZOOM },
    ]);
  });

  it("meets the layer's own floor exactly, leaving no zoom uncovered", () => {
    const { map, added, zoomRanges, fire } = fakeMap();

    showWmsLayer(map, layer, 100);
    showOutlineLayer(map, layer);
    fire("styledata");

    setWmsLayerMinZoom(map, layer.id, 11);
    setOutlineLayerMaxZoom(map, layer.id, 11);
    fire("styledata");

    const outline = zoomRanges.find((range) => range.id === added[1].id);
    const wms = zoomRanges.find((range) => range.id === added[0].id);

    // The handoff is MapLibre's, and it only works if these meet: a gap leaves
    // the layer invisible at zooms the panel says it is on for.
    expect(outline?.maxzoom).toBe(wms?.minzoom);
  });
});

describe("hideOutlineLayer", () => {
  it("hides the raster and keeps it for the next time the layer is on", () => {
    const { map, added, visibility, fire } = fakeMap();

    showOutlineLayer(map, layer);
    fire("styledata");
    visibility.length = 0;

    hideOutlineLayer(map, layer.id);
    fire("styledata");

    expect(visibility).toEqual([{ id: added[0].id, value: "none" }]);
    expect(added).toHaveLength(1);
  });
});
