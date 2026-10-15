import { useEffect, useState } from "react";
import type { Feature, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import type {
  FeatureAttribute,
  MetaDataByLayer,
  MetaDataFeature,
} from "@/api/useMetaData";
import type { MapExtent } from "@/types";
import { MIN_FEATURE_PIXELS } from "@/utils/config";
import { geoBounds } from "@/utils/geo";

/**
 * What the metadata popup shows: which layers are listed, which one is
 * selected, how a feature reads and where the popup sits.
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

// Rows: layer, feature, record

export type MetaDataRowStatus = "pending" | "found" | "empty" | "error";

/**
 * A layer as the popup lists it. A catalogue layer is asked by object name;
 * an imported or hosted one has its features already on the map.
 */
export interface MetaDataLayer {
  id: string;
  name: string;
  objectName?: string | null;
}

/** One label and value within a record, with the label already in prose. */
export interface MetaDataAttribute {
  label: string;
  value: unknown;
}

/**
 * One set of attributes attached to a feature.
 *
 * Most features have exactly one, and for those the distinction between the
 * feature and its record never shows. Some carry several over the one geometry
 * - a consultation area covering twelve nations, each with its own contact -
 * and those are what the pager in the detail is for.
 */
export interface MetaDataRecord {
  /** Unique within its feature, for React keys and the pager. */
  id: string;
  attributes: MetaDataAttribute[];
}

/**
 * One geometry in a layer, with everything recorded against it.
 *
 * A click can land on several of these in one layer where shapes overlap,
 * which is why the popup lists features under their layer rather than listing
 * one thing per layer.
 */
export interface MetaDataFeatureEntry {
  /** Unique within its layer: what the selection and the highlight address. */
  key: string;
  name: string;
  records: MetaDataRecord[];
  /** The source's own id, where it has one stable enough to draw by. */
  id: string | null;
  /** Its shape, where we hold one. */
  geometry: Geometry | null;
  /** Null where nothing carried an extent, which is what the zoom needs. */
  bounds: MapExtent | null;
  /** The records are still being fetched, so the detail has nothing to show. */
  pending?: boolean;
  /** The records could not be fetched, which the detail offers to retry. */
  failed?: boolean;
}

export interface MetaDataRow {
  layer: MetaDataLayer;
  status: MetaDataRowStatus;
  features: MetaDataFeatureEntry[];
  retrying: boolean;
}

/** One record from a warehouse feature's columns, labelled for reading. */
const recordFromProperties = (
  properties: readonly FeatureAttribute[],
): MetaDataRecord => ({
  id: "0",
  attributes: properties.map(({ name, value }) => ({
    label: attributeLabel(name),
    value,
  })),
});

/**
 * The row a layer that could not answer stands in the list with.
 *
 * A feature with no records rather than a row with no features: it is listed,
 * counted and selectable like anything else at the point, and selecting it is
 * what shows the Retry. Nothing else about it is known - that is the problem it
 * is reporting.
 */
const errorFeature = (layer: MetaDataLayer): MetaDataFeatureEntry => ({
  key: `${layer.id}-error`,
  name: layer.name,
  records: [],
  id: null,
  geometry: null,
  bounds: null,
  failed: true,
});

/** The one feature a warehouse layer answers a click with. */
const warehouseFeature = (
  layer: MetaDataLayer,
  feature: MetaDataFeature,
): MetaDataFeatureEntry => ({
  // The warehouse's id where it has one: a layer without one answers with a
  // single feature anyway, so the layer's own id keeps it addressable.
  key: feature.id ?? layer.id,
  name: feature.name || layer.name,
  records: [recordFromProperties(feature.properties)],
  id: feature.id,
  geometry: feature.geometry,
  bounds: feature.bounds,
});

/**
 * Pairs each queried layer with its answer, in the order they were asked.
 *
 * A layer with no answer yet is pending, which covers both the click's one
 * request still being in flight and the request having failed outright - in
 * the second case every row is an error, which is the truthful reading.
 */
export const toRows = (
  layers: readonly AppliedLayer[],
  byLayer: MetaDataByLayer,
  { failed = false, retrying = new Set<string>() }: {
    failed?: boolean;
    retrying?: ReadonlySet<string>;
  } = {},
): MetaDataRow[] =>
  layers.map((layer) => {
    const { objectName } = layer;
    const answer = objectName ? byLayer[objectName] : undefined;
    const status = answer?.status ?? (failed ? "error" : "pending");
    const feature = answer?.feature;
    return {
      layer,
      status,
      features: feature
        ? [warehouseFeature(layer, feature)]
        : status === "error"
        ? [errorFeature(layer)]
        : [],
      retrying: Boolean(objectName && retrying.has(objectName)),
    };
  });

/** An imported feature under a click, as the map reported it. */
export interface ImportedHit {
  layerId: string;
  featureId: string | number | undefined;
  /** The map's own copy, for a feature the layer's data cannot be searched for. */
  rendered?: Feature;
}

/**
 * Rows for the imported layers under a click, answered on the spot: their
 * features are already in the browser, so nothing is asked of map-api.
 *
 * `hits` comes topmost first, and every one of them is listed: overlapping
 * shapes in one layer are several features, and dropping all but the topmost
 * would hide what the click actually landed on. The feature is read back from
 * the layer's own data rather than the map's copy, which clips geometry to a
 * tile and flattens nested attributes to strings.
 */
export const importedRows = (
  hits: readonly ImportedHit[],
  layers: readonly MetaDataLayer[],
  findFeature: (layerId: string, featureId: ImportedHit["featureId"]) => Feature | null,
): MetaDataRow[] => {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const rows = new Map<string, MetaDataRow>();

  hits.forEach(({ layerId, featureId, rendered }, index) => {
    const layer = byId.get(layerId);
    if (!layer) return;

    const feature = findFeature(layerId, featureId) ?? rendered ?? null;
    // One tile's worth of a shape at a time, so the same feature can be
    // reported more than once over a seam.
    const key = featureId === undefined ? `hit-${index}` : String(featureId);

    const row = rows.get(layerId) ?? {
      layer,
      status: "found" as const,
      features: [],
      retrying: false,
    };
    if (row.features.some((entry) => entry.key === key)) return;

    const properties = Object.entries(feature?.properties ?? {}).map(
      ([name, value]) => ({ name, value }),
    );
    row.features.push({
      key,
      // Imported features carry whatever columns the file had, so there is no
      // one of them that names a feature. The layer does.
      name: layer.name,
      records: [recordFromProperties(properties)],
      id: null,
      geometry: feature?.geometry ?? null,
      bounds: feature ? geoBounds([feature]) : null,
    });
    rows.set(layerId, row);
  });

  return [...rows.values()];
};

/** Still waiting on the first answer from at least one layer. */
export const isLoading = (rows: readonly MetaDataRow[]): boolean =>
  rows.some((row) => row.status === "pending");

/** Nothing has answered yet, so there is not even a partial list to show. */
export const isEmptySoFar = (rows: readonly MetaDataRow[]): boolean =>
  rows.every((row) => row.status === "pending");

/**
 * The rows worth a line in the popup: layers with something here, and layers
 * that could not say. A layer with nothing at the point is left out, as is one
 * still being waited on - it joins the list when it answers.
 */
export const visibleRows = (rows: readonly MetaDataRow[]): MetaDataRow[] =>
  rows.filter((row) => row.features.length > 0);

/** Every feature the popup lists, which is what the header counts. */
export const featureCount = (rows: readonly MetaDataRow[]): number =>
  rows.reduce((total, row) => total + row.features.length, 0);

/** Which feature the detail is showing, across layers. */
export interface MetaDataSelection {
  layerId: string;
  featureKey: string;
}

export const sameSelection = (
  one: MetaDataSelection | null,
  two: MetaDataSelection | null,
): boolean =>
  one?.layerId === two?.layerId && one?.featureKey === two?.featureKey;

/** A row paired with one of its features, as the list renders them. */
export interface MetaDataOption {
  row: MetaDataRow;
  feature: MetaDataFeatureEntry;
}

/**
 * Everything in the list that can be selected, in the order it is shown.
 *
 * A layer with one feature is selected by its own row; a layer with several is
 * a heading over its features. Either way this is what the arrow keys step
 * through, so a heading that selects nothing is not in it.
 */
export const selectableOptions = (
  rows: readonly MetaDataRow[],
): MetaDataOption[] =>
  rows.flatMap((row) => row.features.map((feature) => ({ row, feature })));

/**
 * The feature the detail shows: the user's pick while it is still listed, else
 * the first feature that answered.
 *
 * A layer that failed is skipped when something else answered - the user came
 * to read what is here, and a failure above it in the list should not be the
 * first thing they are shown. It is still selectable, and it is all there is
 * when nothing else answered.
 */
export const selectedOption = (
  rows: readonly MetaDataRow[],
  chosen: MetaDataSelection | null,
): MetaDataOption | null => {
  const options = selectableOptions(rows);
  return (
    options.find(
      (option) =>
        option.row.layer.id === chosen?.layerId &&
        option.feature.key === chosen?.featureKey,
    ) ??
    options.find((option) => option.row.status !== "error") ??
    options[0] ??
    null
  );
};

/** What the popup says when no enabled layer has anything at the point. */
export const NOTHING_HERE_TITLE = "No features here";

/**
 * The header: how many things the click landed on, counted across layers.
 *
 * Features rather than layers, because that is what the list underneath has a
 * line for, and it grows as slower layers answer rather than waiting for the
 * last of them.
 */
export const popupTitle = (loading: boolean, features: number): string => {
  if (features === 0) return loading ? "Identifying…" : NOTHING_HERE_TITLE;
  return `${features} ${features === 1 ? "feature" : "features"} at this point`;
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

/**
 * The heading the detail shows: what the layer's own map labels this feature,
 * and the layer's name when its style labels nothing.
 */
export const featureHeading = (option: MetaDataOption): string =>
  option.feature.name || option.row.layer.name;

// Whether a feature can actually be seen where the map is now

export interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Whether a feature is out of sight at the current camera: off the screen
 * entirely, or too small to make out.
 *
 * Both are the same thing to the user - they clicked something the map is not
 * showing them - and both are answered from where the map is now, so the
 * offer to zoom comes and goes with the zoom itself.
 */
export const isOutOfView = (
  box: PixelBox,
  viewport: { width: number; height: number },
  minPixels: number,
): boolean => {
  const offScreen =
    box.right < 0 ||
    box.bottom < 0 ||
    box.left > viewport.width ||
    box.top > viewport.height;

  const tooSmall =
    Math.max(box.right - box.left, box.bottom - box.top) < minPixels;

  return offScreen || tooSmall;
};

/** Whether `bounds` is out of sight at the camera the map is on right now. */
export const boundsOutOfView = (
  map: MapLibreMap | null,
  bounds: MapExtent | null,
): boolean => {
  if (!map || !bounds) return false;

  const [west, south, east, north] = bounds;
  const southWest = map.project([west, south]);
  const northEast = map.project([east, north]);
  const container = map.getContainer();

  return isOutOfView(
    {
      left: Math.min(southWest.x, northEast.x),
      top: Math.min(southWest.y, northEast.y),
      right: Math.max(southWest.x, northEast.x),
      bottom: Math.max(southWest.y, northEast.y),
    },
    { width: container.clientWidth, height: container.clientHeight },
    MIN_FEATURE_PIXELS,
  );
};

/**
 * Whether the feature at `bounds` is out of sight where the map is now.
 *
 * Answered from the live camera rather than once when the popup opened: the
 * user zooms and pans with the popup open, and the offer to zoom to a feature
 * has to come and go with what they can actually see.
 */
export const useFeatureOutOfView = (
  map: MapLibreMap | null,
  bounds: MapExtent | null,
): boolean => {
  const [outOfView, setOutOfView] = useState(false);

  useEffect(() => {
    if (!map || !bounds) {
      setOutOfView(false);
      return undefined;
    }

    // Set to the same boolean, React re-renders nothing - which is what makes
    // this safe on `move`, an event that fires every frame of a gesture.
    const sync = () => setOutOfView(boundsOutOfView(map, bounds));

    sync();
    map.on("move", sync);
    return () => {
      map.off("move", sync);
    };
  }, [map, bounds]);

  return outOfView;
};

// Moving the popup from the keyboard

/** A step of the popup, in pixels, per press of an arrow key. */
export const POPUP_STEP_PX = 8;

/** Shift covers ground faster, for moving it clear of something large. */
export const POPUP_LARGE_STEP_PX = 32;

/**
 * How far an arrow key moves the popup, or null for a key that does not.
 *
 * The grip is draggable with a mouse, so it has to be movable without one.
 */
export const stepFor = (
  key: string,
  shiftKey: boolean,
): { dx: number; dy: number } | null => {
  const step = shiftKey ? POPUP_LARGE_STEP_PX : POPUP_STEP_PX;
  switch (key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
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

/** Shown for a feature that carries no attributes at all. */
export const NO_ATTRIBUTES = "No metadata for this feature.";

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
