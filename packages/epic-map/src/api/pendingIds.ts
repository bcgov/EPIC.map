/**
 * Stand-in ids for rows written to the cache before map-api has one.
 *
 * Negative, so they cannot collide with map-api's serial ids. Counted down so
 * two creates in flight are told apart.
 */
let lastPendingId = 0;

/** A fresh id for a row that exists only in the cache so far. */
export const nextPendingId = (): number => {
  lastPendingId -= 1;
  return lastPendingId;
};

/** True for a row still waiting on the POST that gives it a real id. */
export const isPendingId = (id: number | null | undefined): boolean =>
  id !== null && id !== undefined && id < 0;
