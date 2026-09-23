import { isPendingId } from "@/api/pendingIds";
import type { FavouriteFolder } from "@/api/useFavouriteFolders";
import type { FavouriteLayer } from "@/api/useFavouriteLayers";

export type GroupedFavourites = {
  /** Favourites filed in no folder, in the order map-api returned them. */
  topLevel: FavouriteLayer[];
  /** Favourites filed in a folder we know about, keyed by folder id. */
  inFolder: Map<number, FavouriteLayer[]>;
};

/**
 * Split the favourites into the top level and the folders they are filed in.
 *
 * A layer whose folder is not in `folders` goes to the top level rather than
 * unrendered: the two are separate queries and can disagree, and the top level
 * is where map-api puts it once the folder is really gone.
 */
export const groupByFolder = (
  favourites: readonly FavouriteLayer[],
  folders: readonly FavouriteFolder[],
): GroupedFavourites => {
  const known = new Set(folders.map((folder) => folder.folderId));
  const topLevel: FavouriteLayer[] = [];
  const inFolder = new Map<number, FavouriteLayer[]>();

  for (const favourite of favourites) {
    const { folderId } = favourite;
    if (folderId === null || !known.has(folderId)) {
      topLevel.push(favourite);
      continue;
    }
    const existing = inFolder.get(folderId);
    if (existing) existing.push(favourite);
    else inFolder.set(folderId, [favourite]);
  }

  return { topLevel, inFolder };
};

export type MoveDestination = {
  /** The folder, or null for the top level of Favourites. */
  folderId: number | null;
  name: string;
  current: boolean;
  /** Still waiting on its POST, so it cannot be filed into yet. */
  pending: boolean;
};

/** What the top level is called in the move menu. */
export const TOP_LEVEL_NAME = "Favourites";

/**
 * Everywhere a favourite can be moved to: the top level, then each folder.
 *
 * Current is where the layer is shown, so one filed in a folder we do not know
 * about is current at the top level. See groupByFolder.
 */
export const moveDestinations = (
  layerFolderId: number | null,
  folders: readonly FavouriteFolder[],
): MoveDestination[] => {
  const shownIn = folders.some((folder) => folder.folderId === layerFolderId)
    ? layerFolderId
    : null;
  return [
    {
      folderId: null,
      name: TOP_LEVEL_NAME,
      current: shownIn === null,
      pending: false,
    },
    ...folders.map((folder) => ({
      folderId: folder.folderId,
      name: folder.name,
      current: folder.folderId === shownIn,
      pending: isPendingId(folder.folderId),
    })),
  ];
};
