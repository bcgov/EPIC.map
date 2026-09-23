import { describe, expect, it } from "vitest";
import { isPendingId, nextPendingId } from "@/api/pendingIds";
import type { FavouriteFolder } from "@/api/useFavouriteFolders";
import type { FavouriteLayer } from "@/api/useFavouriteLayers";
import {
  groupByFolder,
  moveDestinations,
  TOP_LEVEL_NAME,
} from "@/components/Layers/Favourites/grouping";

const layer = (id: string, folderId: number | null): FavouriteLayer =>
  ({ id, folderId, favouriteId: Number(id.slice(1)) }) as FavouriteLayer;

const folder = (folderId: number): FavouriteFolder => ({
  folderId,
  name: `Folder ${folderId}`,
  isCollapsed: false,
});

describe("groupByFolder", () => {
  it("splits the favourites by the folder they are filed in", () => {
    const { topLevel, inFolder } = groupByFolder(
      [layer("l1", null), layer("l2", 7), layer("l3", 7), layer("l4", 8)],
      [folder(7), folder(8)],
    );

    expect(topLevel.map((entry) => entry.id)).toEqual(["l1"]);
    expect(inFolder.get(7)?.map((entry) => entry.id)).toEqual(["l2", "l3"]);
    expect(inFolder.get(8)?.map((entry) => entry.id)).toEqual(["l4"]);
  });

  it("keeps the order map-api returned within a folder", () => {
    const { inFolder } = groupByFolder(
      [layer("l3", 7), layer("l1", 7), layer("l2", 7)],
      [folder(7)],
    );

    expect(inFolder.get(7)?.map((entry) => entry.id)).toEqual([
      "l3",
      "l1",
      "l2",
    ]);
  });

  it("shows a layer whose folder is unknown rather than dropping it", () => {
    // The folders call failed or has not landed. The layer is still favourited.
    const { topLevel, inFolder } = groupByFolder(
      [layer("l1", null), layer("l2", 7)],
      [],
    );

    expect(topLevel.map((entry) => entry.id)).toEqual(["l1", "l2"]);
    expect(inFolder.size).toBe(0);
  });

  it("loses no favourite to a folder that was just deleted", () => {
    // The folder is out of the cache before the favourites are refetched.
    const { topLevel } = groupByFolder(
      [layer("l1", 7), layer("l2", 8)],
      [folder(8)],
    );

    expect(topLevel.map((entry) => entry.id)).toEqual(["l1"]);
  });

  it("leaves a folder with nothing in it out of the map", () => {
    const { inFolder } = groupByFolder([layer("l1", null)], [folder(7)]);

    expect(inFolder.get(7)).toBeUndefined();
  });
});

describe("pending ids", () => {
  it("gives every optimistic row an id of its own", () => {
    // Two creates in flight: one response must not claim the other's row.
    expect(nextPendingId()).not.toBe(nextPendingId());
  });

  it("never collides with a row id map-api could return", () => {
    // map-api's ids are serial and positive.
    expect(nextPendingId()).toBeLessThan(0);
  });

  it("recognises a row that has no real id yet", () => {
    expect(isPendingId(nextPendingId())).toBe(true);
    expect(isPendingId(7)).toBe(false);
  });

  it("does not treat the top level as a pending folder", () => {
    // null is "no folder", which is a real place, not a row still in flight.
    expect(isPendingId(null)).toBe(false);
  });
});

describe("moveDestinations", () => {
  const summary = (layerFolderId: number | null, folders: FavouriteFolder[]) =>
    moveDestinations(layerFolderId, folders).map(
      ({ folderId, current }) => [folderId, current] as const,
    );

  it("offers only the top level, as current, when there are no folders", () => {
    expect(summary(null, [])).toEqual([[null, true]]);
  });

  it("marks the top level current for a loose layer and lists every folder", () => {
    expect(summary(null, [folder(7), folder(8)])).toEqual([
      [null, true],
      [7, false],
      [8, false],
    ]);
  });

  it("marks the folder a layer is in current, keeping the top level to go back to", () => {
    expect(summary(8, [folder(7), folder(8)])).toEqual([
      [null, false],
      [7, false],
      [8, true],
    ]);
  });

  it("names the top level Favourites and each folder by its own name", () => {
    expect(
      moveDestinations(null, [folder(7)]).map((entry) => entry.name),
    ).toEqual([TOP_LEVEL_NAME, "Folder 7"]);
  });

  it("treats a layer in a folder we do not know about as at the top level", () => {
    // Matches groupByFolder, which shows it there.
    expect(summary(99, [folder(7)])).toEqual([
      [null, true],
      [7, false],
    ]);
  });

  it("flags a folder still waiting on its POST, which cannot be filed into", () => {
    const pending = nextPendingId();
    const [, entry] = moveDestinations(null, [folder(pending)]);
    expect(entry.pending).toBe(true);
    expect(moveDestinations(null, [folder(7)])[1].pending).toBe(false);
  });
});
