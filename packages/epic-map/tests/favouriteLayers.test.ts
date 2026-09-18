import { describe, expect, it } from "vitest";
import { toAppliedLayer } from "@/api/useAppliedLayers";
import { toFavouriteLayer } from "@/api/useFavouriteLayers";

const row = {
  id: 4,
  source: "bcdc",
  package_id: "0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  object_name: "WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES",
  display_name: "Indian Reserves",
  sort_order: 1,
};

describe("toFavouriteLayer", () => {
  it("gives a stored row the id a catalogue result would have", () => {
    // The search result star matches on this id, so both spellings must agree.
    expect(toFavouriteLayer(row).id).toBe(`cat-${row.package_id}`);
  });

  it("matches the id an applied layer gets for the same dataset", () => {
    // A layer can be starred and applied at once, so both mappers must agree.
    expect(toFavouriteLayer(row).id).toBe(
      toAppliedLayer({ ...row, opacity: 100 }).id,
    );
  });

  it("carries the row id that DELETE addresses", () => {
    expect(toFavouriteLayer(row).favouriteId).toBe(4);
  });

  it("links to the dataset by package id, not by title", () => {
    expect(toFavouriteLayer(row).metadataUrl).toBe(
      `https://catalogue.data.gov.bc.ca/dataset/${row.package_id}`,
    );
  });
});
