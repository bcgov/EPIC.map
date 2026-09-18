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
