/**
 * Dragging a favourite between the top level and a folder.
 *
 * Native HTML5 drag and drop, so the package ships no drag dependency to its
 * hosts. Pure helpers only; the target side is `useFavouriteDropTarget`.
 */

/**
 * The drag payload is the layer id, under a type of our own.
 *
 * `getData` is blocked during dragover but `types` is readable, so the type is
 * all a target can tell one of our rows by before the drop.
 */
export const FAVOURITE_DRAG_TYPE = "application/x-epic-favourite";

/** True when what is being dragged is one of our favourite rows. */
export const isFavouriteDrag = (transfer: DataTransfer | null): boolean =>
  Boolean(transfer?.types.includes(FAVOURITE_DRAG_TYPE));

export const startFavouriteDrag = (
  transfer: DataTransfer,
  layerId: string,
): void => {
  transfer.setData(FAVOURITE_DRAG_TYPE, layerId);
  transfer.effectAllowed = "move";
};

/** The layer id being dropped, or null when the drag came from elsewhere. */
export const droppedLayerId = (transfer: DataTransfer): string | null =>
  transfer.getData(FAVOURITE_DRAG_TYPE) || null;
