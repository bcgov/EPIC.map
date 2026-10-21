import type { Map as MapLibreMap, Point as MapLibrePoint } from "maplibre-gl";
import type { LocalLayerStyle } from "@/components/Layers/layerUtils";
import { localDrawnIds } from "@/components/Layers/layerUtils";
import { EAO_OBJECT_NAME, localLayerId } from "@/utils/localLayers";

/**
 * What of the EAO layer is drawn, and when (MAP-46).
 *
 * The layer arrives styled for every category, but the map does not show them
 * all at once. Footprints are tied to the project dots: a project whose dot the
 * filter bar has hidden has no boundary drawn either, so the two always agree.
 *
 * Components - the orange, green and purple of the style - stay off in this
 * iteration. The prototype reveals them per project once its panel is open,
 * which is panel state this does not model yet; `componentSpecIds` is here so
 * that work has one place to change. They are filtered by project regardless,
 * so revealing them cannot leave a component behind when its project is
 * filtered out.
 */

/** Matches nothing, which is how a spec is left on the map but not drawn. */
const NEVER: unknown = ["==", ["literal", 1], ["literal", 0]];

/** The specs drawing a project's overall boundary, as eao_style() names them. */
export const FOOTPRINT_SPEC_IDS = ["footprint-fill", "footprint-outline"];

/** The specs drawing everything that is not a boundary. Off for now. */
export const componentSpecIds = (style: LocalLayerStyle): string[] =>
  style.layers
    .map((spec) => spec.id)
    .filter((id) => !FOOTPRINT_SPEC_IDS.includes(id));

/**
 * The extra filter each spec of the EAO style takes, by spec id.
 *
 * `track_id` rather than a project name: the tile carries the id and the
 * delivery's names differ from Track's.
 */
export const eaoSpecFilters = (
  style: LocalLayerStyle,
  visibleTrackIds: readonly number[],
): Record<string, unknown> => {
  const filters: Record<string, unknown> = {};

  // Spread into a literal: MapLibre compares against a value, and a readonly
  // array is not one it will accept.
  const onVisibleProject: unknown = [
    "in",
    ["get", "track_id"],
    ["literal", [...visibleTrackIds]],
  ];

  FOOTPRINT_SPEC_IDS.forEach((id) => {
    filters[id] = onVisibleProject;
  });

  // Components carry the project filter as well as their own reveal
  // condition, so that a component can never outlive the dot and footprint it
  // belongs to. `revealed` is what changes when the panel can turn a
  // project's components on; the project filter beside it already holds.
  const revealed: unknown = NEVER;
  componentSpecIds(style).forEach((id) => {
    filters[id] = ["all", onVisibleProject, revealed];
  });
  return filters;
};

/** The drawn MapLibre layers showing footprints, for a click to be tested against. */
export const footprintDrawnIds = (map: MapLibreMap): string[] => {
  const ids = localDrawnIds(map, localLayerId(EAO_OBJECT_NAME));
  return ids.filter((id) =>
    FOOTPRINT_SPEC_IDS.some((spec) => id.endsWith(`-${spec}`)),
  );
};

/**
 * The Track project whose footprint is under this point, or null.
 *
 * Clicking a boundary is how the prototype opens a project, the dot being small
 * and the boundary being the thing on screen.
 */
export const footprintTrackIdAt = (
  map: MapLibreMap,
  point: MapLibrePoint,
): number | null => {
  const layers = footprintDrawnIds(map).filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;

  for (const feature of map.queryRenderedFeatures(point, { layers })) {
    const trackId = Number(feature.properties?.track_id);
    if (Number.isFinite(trackId)) return trackId;
  }
  return null;
};
