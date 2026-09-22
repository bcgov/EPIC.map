import type { AppliedLayer } from "@/api/useAppliedLayers";
import type { MetaDataFeature, MetaDataResult } from "@/api/useMetaData";
import type { MapExtent } from "@/types";

/**
 * What the metadata popup shows, worked out apart from React and the map so it
 * can be tested as plain data.
 */

interface ScreenPoint {
  x: number;
  y: number;
}

interface Unprojects {
  unproject: (point: [number, number]) => { lng: number; lat: number };
}

/** Enough decimals for a pixel at MAX_ZOOM, few enough to share a cache key. */
const BOX_DECIMALS = 6;

const round = (value: number) => Number(value.toFixed(BOX_DECIMALS));

/**
 * The ground `tolerance` pixels either side of a click, as [west, south, east, north].
 *
 * Unprojected corner by corner rather than widened in degrees, so the box is
 * the same few pixels at every latitude and zoom.
 */
export const clickBox = (
  map: Unprojects,
  { x, y }: ScreenPoint,
  tolerance: number,
): MapExtent => {
  const southWest = map.unproject([x - tolerance, y + tolerance]);
  const northEast = map.unproject([x + tolerance, y - tolerance]);
  return [
    round(Math.min(southWest.lng, northEast.lng)),
    round(Math.min(southWest.lat, northEast.lat)),
    round(Math.max(southWest.lng, northEast.lng)),
    round(Math.max(southWest.lat, northEast.lat)),
  ];
};

// Rows

export type MetaDataRowStatus = "pending" | "found" | "empty" | "error";

export interface MetaDataRow {
  layer: AppliedLayer;
  status: MetaDataRowStatus;
  feature: MetaDataFeature | null;
  retrying: boolean;
}

const statusOf = (result: MetaDataResult): MetaDataRowStatus => {
  if (result.isError) return "error";
  if (result.isPending) return "pending";
  return result.data ? "found" : "empty";
};

/** Pairs each queried layer with its answer, in the order they were asked. */
export const toRows = (
  layers: readonly AppliedLayer[],
  results: readonly MetaDataResult[],
): MetaDataRow[] =>
  layers.map((layer, index) => {
    const result = results[index];
    return {
      layer,
      status: result ? statusOf(result) : "pending",
      feature: result?.data ?? null,
      retrying: Boolean(result?.isError && result.isFetching),
    };
  });

/** Still waiting on the first answer from at least one layer. */
export const isLoading = (rows: readonly MetaDataRow[]): boolean =>
  rows.some((row) => row.status === "pending");

/**
 * The rows worth a line in the popup: layers with something here, and layers
 * that could not say. A layer with nothing at the point is left out.
 */
export const visibleRows = (rows: readonly MetaDataRow[]): MetaDataRow[] =>
  rows.filter((row) => row.status === "found" || row.status === "error");

/**
 * The row the detail shows: the user's pick while it is still listed, else the
 * first layer that answered, else the first row at all - which is a failure,
 * so its Retry is what the user sees.
 */
export const selectedRow = (
  rows: readonly MetaDataRow[],
  chosenLayerId: string | null,
): MetaDataRow | null =>
  rows.find((row) => row.layer.id === chosenLayerId) ??
  rows.find((row) => row.status === "found") ??
  rows[0] ??
  null;

export const popupTitle = (loading: boolean, rowCount: number): string => {
  if (loading) return "Identifying…";
  return `${rowCount} ${rowCount === 1 ? "layer" : "layers"} at this point`;
};

/** Up, Down, Home and End through a list, stopping at either end. */
export const steppedIndex = (
  key: string,
  index: number,
  length: number,
): number | null => {
  if (length === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(index + 1, length - 1);
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
};

// Attributes

/** Warehouse column names are SHOUTED_SNAKE_CASE; the popup reads as prose. */
export const attributeLabel = (name: string): string =>
  name
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export const EMPTY_VALUE = "—";

export const attributeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// Where the popup opens

export interface PopupPlacement {
  left: number;
  top: number;
  width: number;
}

/** Room left between the popup and the edge of the map. */
export const POPUP_MARGIN_PX = 8;

/** How far off the click the popup sits, so the point itself stays in view. */
const POPUP_OFFSET_PX = 16;

/** Below this the popup opens higher up rather than squeezing its body. */
const POPUP_MIN_HEIGHT_PX = 240;

/**
 * Beside the click, on whichever side it fits, and never past the map's edge.
 *
 * Height is not measured: the popup takes what is left below its top and its
 * body scrolls, so it can grow from a skeleton to a long list in place.
 */
export const popupPlacement = (
  click: ScreenPoint,
  container: { width: number; height: number },
  preferredWidth: number,
): PopupPlacement => {
  const width = Math.max(
    0,
    Math.min(preferredWidth, container.width - 2 * POPUP_MARGIN_PX),
  );

  const right = click.x + POPUP_OFFSET_PX;
  const left =
    right + width + POPUP_MARGIN_PX <= container.width
      ? right
      : click.x - POPUP_OFFSET_PX - width;

  const lowestTop = container.height - POPUP_MARGIN_PX - POPUP_MIN_HEIGHT_PX;
  const top = Math.max(
    POPUP_MARGIN_PX,
    Math.min(click.y - POPUP_OFFSET_PX, lowestTop),
  );

  return {
    left: clampToContainer(left, width, container.width),
    top,
    width,
  };
};

/** Keeps a box of `size` starting at `start` inside `extent`, with the margin. */
export const clampToContainer = (
  start: number,
  size: number,
  extent: number,
): number =>
  Math.max(
    POPUP_MARGIN_PX,
    Math.min(start, extent - size - POPUP_MARGIN_PX),
  );
