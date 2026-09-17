/** A visible layer and the zoom below which openmaps will not draw it. */
export interface LayerFloor {
  id: string;
  floor: number;
}

/**
 * Which of `floors` the given zoom is too far out to draw.
 *
 * Returns `current` itself, not an equal copy, when the answer has not changed.
 * That identity is the whole point: MapLibre's `zoom` event fires on every
 * frame of a gesture, but which layers sit below their floor changes only when
 * the zoom crosses one - a few times in a full sweep rather than sixty times a
 * second. The result is held in state and read through context by every row in
 * the panel, so a fresh Set per frame would be a fresh context value per frame,
 * and a re-render of every row with it.
 */
export const layersBelowFloor = (
  floors: readonly LayerFloor[],
  zoom: number,
  current: ReadonlySet<string>,
): ReadonlySet<string> => {
  const next = new Set<string>();
  for (const { id, floor } of floors) {
    if (zoom < floor) next.add(id);
  }

  if (next.size !== current.size) return next;
  for (const id of next) {
    if (!current.has(id)) return next;
  }
  return current;
};
