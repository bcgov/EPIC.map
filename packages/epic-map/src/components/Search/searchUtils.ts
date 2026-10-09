/**
 * Turning what the two sources return into the rows the dropdown draws, and
 * moving a selection through them.
 *
 * Pure, and deliberately kept out of the components. The geocoder answers one
 * query with several shapes of thing — a civic address, a block, a street, a
 * bare locality — and which fields are populated is what tells them apart.
 * Getting that wrong does not throw; it draws a row with a doubled name or an
 * empty pill, which only a test comparing against real responses will catch.
 */

import type { FilterOption, MapProject } from "@/components/Filters/filterUtils";
import {
  DEFAULT_PLACE_ZOOM,
  PLACE_ZOOM,
  PROJECT_SEARCH_MAX_RESULTS,
  PROJECT_ZOOM,
} from "@/utils/config";

/**
 * The slice of a geocoder feature this package relies on.
 *
 * Every field is optional because the service omits none of them but empties
 * most of them: a bare locality comes back with `civicNumber`, `streetName`,
 * `streetType` and `streetDirection` all present and all `""`. `civicNumber` is
 * a number when there is one and `""` when there is not, which is why it is
 * typed as both rather than coerced at the edge.
 */
export interface GeocoderProperties {
  fullAddress?: string;
  civicNumber?: number | string;
  streetName?: string;
  streetType?: string;
  streetDirection?: string;
  localityName?: string;
  localityType?: string;
  matchPrecision?: string;
}

export interface GeocoderFeature {
  properties?: GeocoderProperties;
  geometry?: { coordinates?: [number, number] };
}

export interface GeocoderResponse {
  features?: GeocoderFeature[];
}

/** A place, reduced to the row the dropdown draws and the camera it implies. */
export interface PlaceResult {
  id: string;
  /** The row's title. */
  name: string;
  /** The grey pill's label, or null when the feature classifies itself as nothing. */
  pill: string | null;
  /** Shown beside the pill, and only for a street address. */
  locality: string | null;
  /** `[lng, lat]`, as both the geocoder and MapLibre order it. */
  coordinates: [number, number];
  zoom: number;
}

/** A project match, reduced the same way. */
export interface ProjectResult {
  id: number;
  name: string;
  /** Track's name for the project's type, or null when it has none. */
  type: string | null;
  /** `[lng, lat]`, or null when Track holds no usable coordinate. */
  coordinates: [number, number] | null;
  zoom: number;
}

/** One row of the dropdown, in the order the list is walked. */
export type SearchRow =
  | { kind: "project"; project: ProjectResult }
  | { kind: "place"; place: PlaceResult };

/**
 * `localityType` as the service sends it when it has none.
 *
 * Not an empty string, which is what the ticket anticipated — the literal word,
 * and it is common rather than exceptional: Carpenter Lake and Ditidaht both
 * come back this way. Treated as absent so the pill falls through to the match
 * precision instead of printing a label that classifies nothing.
 */
const UNKNOWN_LOCALITY_TYPE = "unknown";

/**
 * What each `matchPrecision` is called, when the locality has no type of its
 * own. A precision not listed here has no pill rather than a raw code.
 *
 * `PROVINCE` is deliberately absent — see NO_MATCH_PRECISION, which drops those
 * features before they could ever need a label.
 */
const PRECISION_LABELS: Record<string, string> = {
  CIVIC_NUMBER: "Address",
  BLOCK: "Block",
  STREET: "Street",
  LOCALITY: "Locality",
};

/**
 * The precision the geocoder answers with when it matched nothing.
 *
 * It has no "no results" response: a query it cannot place comes back as one
 * feature that fell all the way back to the province, scored 1 against the 60s a
 * real match earns. In practice that is always the same row — "BC Harbours Board
 * Rwy, Surrey" — so "tmo", "zzzzz" and "qqq" all suggest it, which is worse than
 * an empty list because it reads as a real place the user has never heard of.
 *
 * Dropped by precision rather than by a score threshold: this is a statement
 * about what the service did, not a guess about how good the answer was, and it
 * needs no number anyone has to tune. Nothing legitimate is lost — even a search
 * for "British Columbia" comes back as streets, never as the province.
 */
const NO_MATCH_PRECISION = "PROVINCE";

/** Join the parts that have something in them, with single spaces. */
const join = (...parts: Array<string | number | undefined>): string =>
  parts
    .map((part) => (part === undefined ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ");

/** The leading element of `fullAddress`, which is the place without its province. */
const leadingPart = (fullAddress?: string): string =>
  (fullAddress ?? "").split(",")[0].trim();

/** The street, however much of one the feature carries. */
const streetOf = (properties: GeocoderProperties): string =>
  join(
    properties.streetName,
    properties.streetType,
    properties.streetDirection,
  );

/**
 * The row's title: the most specific thing the feature actually names.
 *
 * A civic number is only a title alongside a street — on its own it is a number
 * with nothing to number — so it is the pair that decides, not the number.
 */
export const placeName = (properties: GeocoderProperties): string => {
  const street = streetOf(properties);
  const civic = String(properties.civicNumber ?? "").trim();

  if (civic && street) return join(civic, street);
  if (street) return street;

  return (properties.localityName ?? "").trim() ||
    leadingPart(properties.fullAddress);
};

/**
 * The pill's label.
 *
 * `localityType` is the authoritative classifier and is used verbatim, whatever
 * it says — the full set is defined by BC's geographic naming and is not ours to
 * allow-list. The precision is a fallback for the address-level hits that carry
 * no locality type, and null is a real answer: a feature that classifies itself
 * as nothing gets no pill rather than a labelled gap.
 */
export const placePill = (properties: GeocoderProperties): string | null => {
  const localityType = (properties.localityType ?? "").trim();
  if (localityType && localityType.toLowerCase() !== UNKNOWN_LOCALITY_TYPE) {
    return localityType;
  }

  return PRECISION_LABELS[(properties.matchPrecision ?? "").trim()] ?? null;
};

/**
 * The locality shown beside the pill, or null.
 *
 * Only for a row titled with a street, because that is the only case where the
 * title does not already contain it. For a bare locality the title IS the
 * locality, and repeating it gives the "Carpenter Lake / Carpenter Lake" the
 * design rules out.
 */
export const placeLocality = (
  properties: GeocoderProperties,
): string | null => {
  if (!(properties.streetName ?? "").trim()) return null;
  return (properties.localityName ?? "").trim() || null;
};

/** How far to zoom for a feature of this precision. */
export const placeZoom = (matchPrecision?: string): number =>
  PLACE_ZOOM[(matchPrecision ?? "").trim()] ?? DEFAULT_PLACE_ZOOM;

/**
 * One geocoder feature as a row, or null when it carries no coordinate.
 *
 * A place that cannot be put on the map is not a result: the row's whole purpose
 * is somewhere to fly to, and a row that silently does nothing when clicked is
 * worse than one absent from the list.
 *
 * The index is part of the id because the geocoder issues none, and because
 * results are passed through verbatim — two features may agree on every field
 * shown and still be different places.
 */
export const toPlaceResult = (
  feature: GeocoderFeature,
  index: number,
): PlaceResult | null => {
  const coordinates = feature.geometry?.coordinates;
  if (
    !coordinates ||
    typeof coordinates[0] !== "number" ||
    typeof coordinates[1] !== "number"
  ) {
    return null;
  }

  const properties = feature.properties ?? {};
  if ((properties.matchPrecision ?? "").trim() === NO_MATCH_PRECISION) {
    return null;
  }

  const name = placeName(properties);
  if (!name) return null;

  return {
    id: `place-${index}`,
    name,
    pill: placePill(properties),
    locality: placeLocality(properties),
    coordinates: [coordinates[0], coordinates[1]],
    zoom: placeZoom(properties.matchPrecision),
  };
};

/** Every feature in a response that resolves to a drawable row. */
export const toPlaceResults = (
  response: GeocoderResponse | undefined,
): PlaceResult[] =>
  (response?.features ?? [])
    .map(toPlaceResult)
    .filter((place): place is PlaceResult => place !== null);

/**
 * Projects whose name contains the query.
 *
 * Matched here rather than as a request because the whole list is already in the
 * browser — the filter bar needs it in full to compute its faceted counts — so a
 * search over it is a few hundred comparisons against a round trip.
 *
 * Deliberately over every project rather than the filtered subset. Search is how
 * a user reaches something they cannot see, and a project hidden by a filter the
 * user has forgotten is exactly the case where being unable to find it is worst.
 */
export const matchProjects = (
  projects: readonly MapProject[],
  types: readonly FilterOption[],
  query: string,
  limit: number = PROJECT_SEARCH_MAX_RESULTS,
): ProjectResult[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const typeNames = new Map(types.map((type) => [type.id, type.name]));

  return projects
    .filter((project) => project.name.toLowerCase().includes(needle))
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      name: project.name,
      type:
        project.typeId === null ? null : typeNames.get(project.typeId) ?? null,
      coordinates:
        project.longitude === null || project.latitude === null
          ? null
          : ([project.longitude, project.latitude] as [number, number]),
      zoom: PROJECT_ZOOM,
    }));
};

/**
 * The two groups as one list, projects first.
 *
 * The dropdown draws them as two sections, but the keyboard walks one list —
 * which is what makes Down from the last project land on the first place rather
 * than stop at a heading.
 */
export const toRows = (
  projects: readonly ProjectResult[],
  places: readonly PlaceResult[],
): SearchRow[] => [
  ...projects.map((project): SearchRow => ({ kind: "project", project })),
  ...places.map((place): SearchRow => ({ kind: "place", place })),
];

/**
 * Where the active row moves to.
 *
 * `-1` is "nothing active", which is where the list starts and what Up from the
 * first row returns to — the user can get back to their own typing without
 * closing the dropdown. It is a station on the cycle rather than a stop: Down
 * from the last row and Up from `-1` both wrap, so holding either arrow walks
 * the whole list round and through the input again.
 */
export const steppedIndex = (
  current: number,
  delta: 1 | -1,
  count: number,
): number => {
  if (count === 0) return -1;

  const next = current + delta;
  if (next < 0) return current === -1 ? count - 1 : -1;
  return next >= count ? 0 : next;
};
