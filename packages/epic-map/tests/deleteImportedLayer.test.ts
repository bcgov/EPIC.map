import { QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { FeatureCollection } from "geojson";
import { describe, expect, it, vi } from "vitest";
import {
  deleteImportedLayer,
  IMPORTED_LAYERS_KEY,
  IMPORTED_LAYERS_PATH,
  importedFeaturesKey,
  type ImportedLayer,
} from "@/api/useImportedLayers";
import {
  withoutOpacity,
  withoutShown,
} from "@/components/Layers/UserLayers/ImportedLayersContext";

const ROADS = "0b8f6a57-3c0e-4c55-9d38-8e5a4c1c2f10";
const RIVERS = "6f1d2c3b-4a59-4e8f-9b7a-1c2d3e4f5a6b";

const layer = (id: string, name: string): ImportedLayer => ({
  id,
  name,
  description: null,
  isSensitive: false,
  sourceFormat: "Shapefile",
  sourceFilename: `${name.toLowerCase()}.zip`,
  geometryType: "LineString",
  featureCount: 1,
  extent: null,
  uploadedAt: "2026-09-29T17:22:12Z",
});

const features: FeatureCollection = { type: "FeatureCollection", features: [] };

/** A cache holding both layers and the features of each, as after switching both on. */
const seeded = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(IMPORTED_LAYERS_KEY, [
    layer(ROADS, "Roads"),
    layer(RIVERS, "Rivers"),
  ]);
  queryClient.setQueryData(importedFeaturesKey(ROADS), features);
  queryClient.setQueryData(importedFeaturesKey(RIVERS), features);
  return queryClient;
};

const listedIds = (queryClient: QueryClient) =>
  queryClient
    .getQueryData<ImportedLayer[]>(IMPORTED_LAYERS_KEY)
    ?.map((entry) => entry.id);

describe("deleteImportedLayer", () => {
  it("asks map-api to delete the layer", async () => {
    const api = { delete: vi.fn().mockResolvedValue({ status: 204 }) };

    await deleteImportedLayer(api, seeded(), ROADS);

    expect(api.delete).toHaveBeenCalledWith(`${IMPORTED_LAYERS_PATH}/${ROADS}`);
  });

  it("drops the layer from the list, leaving the rest in order", async () => {
    const queryClient = seeded();

    await deleteImportedLayer({ delete: vi.fn() }, queryClient, ROADS);

    expect(listedIds(queryClient)).toEqual([RIVERS]);
  });

  it("forgets the layer's cached features, and only that layer's", async () => {
    const queryClient = seeded();

    await deleteImportedLayer({ delete: vi.fn() }, queryClient, ROADS);

    // Gone rather than emptied, so nothing can draw it again from the cache.
    expect(queryClient.getQueryCache().find({ queryKey: importedFeaturesKey(ROADS) }))
      .toBeUndefined();
    expect(queryClient.getQueryData(importedFeaturesKey(RIVERS))).toBe(features);
  });

  it("keeps the list query itself, which shares the features key's prefix", async () => {
    const queryClient = seeded();

    await deleteImportedLayer({ delete: vi.fn() }, queryClient, ROADS);

    expect(queryClient.getQueryCache().find({ queryKey: IMPORTED_LAYERS_KEY, exact: true }))
      .toBeDefined();
  });

  it("leaves the layer and its features alone when map-api refuses", async () => {
    const queryClient = seeded();
    const refusal = new AxiosError("Request failed", "ERR_BAD_RESPONSE");
    const api = { delete: vi.fn().mockRejectedValue(refusal) };

    await expect(deleteImportedLayer(api, queryClient, ROADS)).rejects.toBe(refusal);

    expect(listedIds(queryClient)).toEqual([ROADS, RIVERS]);
    expect(queryClient.getQueryData(importedFeaturesKey(ROADS))).toBe(features);
  });

  it("does not invent a list that was never fetched", async () => {
    const queryClient = new QueryClient();

    await deleteImportedLayer({ delete: vi.fn() }, queryClient, ROADS);

    expect(queryClient.getQueryData(IMPORTED_LAYERS_KEY)).toBeUndefined();
  });
});

describe("withoutShown", () => {
  it("switches off only the deleted layer", () => {
    const shown = new Set([ROADS, RIVERS]);

    expect([...withoutShown(shown, ROADS)]).toEqual([RIVERS]);
    expect(shown.has(ROADS)).toBe(true);
  });

  it("returns the same set for a layer that was off, so nothing re-renders", () => {
    const shown = new Set([RIVERS]);

    expect(withoutShown(shown, ROADS)).toBe(shown);
  });
});

describe("withoutOpacity", () => {
  it("forgets only the deleted layer's opacity", () => {
    const opacities = { [ROADS]: 40, [RIVERS]: 70 };

    expect(withoutOpacity(opacities, ROADS)).toEqual({ [RIVERS]: 70 });
    expect(opacities[ROADS]).toBe(40);
  });

  it("returns the same object for a layer never given one", () => {
    const opacities = { [RIVERS]: 70 };

    expect(withoutOpacity(opacities, ROADS)).toBe(opacities);
  });
});
