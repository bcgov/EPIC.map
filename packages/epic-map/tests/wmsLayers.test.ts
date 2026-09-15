import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { showWmsLayer } from "@/components/Layers/wmsLayers";

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
  const added: string[] = [];

  const map = {
    isStyleLoaded: () => false,
    on: (event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
    },
    off: (event: string, handler: () => void) => {
      handlers.get(event)?.delete(handler);
    },
    getLayer: () => undefined,
    getSource: () => undefined,
    addSource: () => undefined,
    addLayer: ({ id }: { id: string }) => added.push(id),
  };

  return {
    map: map as unknown as MapLibreMap,
    added,
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
});
