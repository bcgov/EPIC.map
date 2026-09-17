import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  setWmsLayerMinZoom,
  showWmsLayer,
} from "@/components/Layers/wmsLayers";
import {
  MAX_ZOOM,
  MIN_ZOOM,
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
 * helper listens for. `isStyleLoaded` stays false throughout: that is the state
 * a map is in while the basemap's tiles and sprite are still downloading.
 */
const fakeMap = () => {
  const handlers = new Map<string, Set<() => void>>();
  const added: { id: string; minzoom?: number }[] = [];
  const sources: { tiles?: string[]; tileSize?: number }[] = [];
  const zoomRanges: { id: string; minzoom: number; maxzoom: number }[] = [];

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
    // what tells showWmsLayer's "draw it" path from its "reveal it" one.
    getLayer: (id: string) => added.find((spec) => spec.id === id),
    setLayerZoomRange: (id: string, minzoom: number, maxzoom: number) =>
      zoomRanges.push({ id, minzoom, maxzoom }),
    getSource: () => undefined,
    addSource: (_id: string, spec: { tiles?: string[]; tileSize?: number }) =>
      sources.push(spec),
    addLayer: (spec: { id: string; minzoom?: number }) => added.push(spec),
  };

  return {
    map: map as unknown as MapLibreMap,
    added,
    sources,
    zoomRanges,
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
