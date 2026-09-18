import { describe, expect, it } from "vitest";
import { toFavouriteFolder } from "@/api/useFavouriteFolders";
import { toFavouriteLayer } from "@/api/useFavouriteLayers";
import {
  FAVOURITE_DRAG_TYPE,
  droppedLayerId,
  isFavouriteDrag,
  startFavouriteDrag,
} from "@/components/Layers/Favourites/favouriteDrag";

const folderRow = {
  id: 7,
  name: "Wildfire",
  is_collapsed: true,
  sort_order: 1,
};

const layerRow = {
  id: 4,
  source: "bcdc",
  package_id: "0c1c0e2d-6a5e-4d9d-9c3f-1e2b3c4d5e6f",
  object_name: "WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES",
  display_name: "Indian Reserves",
  folder_id: null,
  sort_order: 1,
};

/** Enough of a DataTransfer for the helpers, which only read types and data. */
const fakeTransfer = (data: Record<string, string> = {}) => {
  const store = { ...data };
  return {
    types: Object.keys(store),
    effectAllowed: "none",
    getData: (type: string) => store[type] ?? "",
    setData: (type: string, value: string) => {
      store[type] = value;
    },
  } as unknown as DataTransfer;
};

describe("toFavouriteFolder", () => {
  it("carries the row id that every folder call addresses", () => {
    expect(toFavouriteFolder(folderRow).folderId).toBe(7);
  });

  it("reads the stored collapsed state", () => {
    // The chevron is restored from map-api, not from local state.
    expect(toFavouriteFolder(folderRow).isCollapsed).toBe(true);
    expect(toFavouriteFolder({ ...folderRow, is_collapsed: false }).isCollapsed)
      .toBe(false);
  });

  it("keeps the name as map-api stored it", () => {
    // Including the fallback: a blank name comes back already named.
    expect(toFavouriteFolder({ ...folderRow, name: "Untitled folder" }).name)
      .toBe("Untitled folder");
  });
});

describe("toFavouriteLayer folder membership", () => {
  it("puts a layer with no folder at the top level", () => {
    expect(toFavouriteLayer(layerRow).folderId).toBeNull();
  });

  it("carries the folder a layer is filed in", () => {
    expect(toFavouriteLayer({ ...layerRow, folder_id: 7 }).folderId).toBe(7);
  });
});

describe("favouriteDrag", () => {
  it("recognises one of our rows by its type", () => {
    // getData is blocked during dragover, so the type is all a target can read.
    expect(isFavouriteDrag(fakeTransfer({ [FAVOURITE_DRAG_TYPE]: "cat-1" })))
      .toBe(true);
  });

  it("ignores a drag that came from outside the panel", () => {
    expect(isFavouriteDrag(fakeTransfer({ "text/plain": "hello" }))).toBe(false);
    expect(isFavouriteDrag(null)).toBe(false);
  });

  it("carries the layer id under its own type", () => {
    const transfer = fakeTransfer();

    startFavouriteDrag(transfer, "cat-abc");

    expect(droppedLayerId(transfer)).toBe("cat-abc");
    expect(transfer.effectAllowed).toBe("move");
  });

  it("reads no layer id from a foreign drag", () => {
    // A file dropped on a folder must not be treated as a favourite.
    expect(droppedLayerId(fakeTransfer({ "text/plain": "hello" }))).toBeNull();
  });
});
