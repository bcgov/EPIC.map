import { describe, expect, it } from "vitest";
import { toAppliedLayer } from "@/api/useAppliedLayers";

const row = {
  id: 7,
  source: "bcdc",
  package_id: "0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  object_name: "WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES",
  display_name: "Indian Reserves",
  opacity: 60,
  sort_order: 2,
};

describe("toAppliedLayer", () => {
  it("gives a stored row the id a catalogue result would have", () => {
    // The panel matches a restored layer to a search result by this id, so a
    // change to either spelling has to be a change to both.
    expect(toAppliedLayer(row).id).toBe(`cat-${row.package_id}`);
  });

  it("carries the row id and opacity the API stored", () => {
    const layer = toAppliedLayer(row);
    expect(layer.appliedId).toBe(7);
    expect(layer.opacity).toBe(60);
  });

  it("links to the dataset by package id, not by title", () => {
    expect(toAppliedLayer(row).metadataUrl).toBe(
      `https://catalogue.data.gov.bc.ca/dataset/${row.package_id}`,
    );
  });
});
