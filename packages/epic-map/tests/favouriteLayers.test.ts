import { describe, expect, it } from "vitest";
import { toAppliedLayer } from "@/api/useAppliedLayers";
import { toFavouriteLayer } from "@/api/useFavouriteLayers";

const row = {
  id: 4,
  source: "bcdc",
  package_id: "0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  object_name: "WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES",
  display_name: "Indian Reserves",
  folder_id: null,
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

describe("toFavouriteLayer, for a layer map-api hosts", () => {
  const hosted = {
    id: 9,
    source: "local",
    package_id: "",
    object_name: "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP",
    display_name: "Profiles of Indigenous People",
    folder_id: null,
    sort_order: 1,
    restricted: true,
  };

  it("identifies it by object name, having no package to go by", () => {
    expect(toFavouriteLayer(hosted).id).toBe(`local-${hosted.object_name}`);
  });

  it("links the catalogue page the registry names, having no package to go by", () => {
    expect(toFavouriteLayer(hosted).metadataUrl).toContain(
      "catalogue.data.gov.bc.ca/dataset/profiles-of-indigenous-people",
    );
  });

  it("describes it from the registry, since the stored row carries no description", () => {
    expect(toFavouriteLayer(hosted).description).toContain(
      "duty to consult with First Nations",
    );
  });

  it("offers no metadata page for a hosted layer the registry does not know", () => {
    const unknown = { ...hosted, object_name: "WHSE_TEST.NOT_HOSTED" };
    expect(toFavouriteLayer(unknown).metadataUrl).toBeNull();
    expect(toFavouriteLayer(unknown).description).toBeNull();
  });

  it("carries the flag the row renders its held star from", () => {
    expect(toFavouriteLayer(hosted).restricted).toBe(true);
  });

  it("leaves a starred layer unrestricted", () => {
    expect(toFavouriteLayer(row).restricted).toBe(false);
  });
});
