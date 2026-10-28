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
 * Components - the orange, green and purple of the style - are drawn only
 * where the open project's panel reveals them, by feature id. A footprint is
 * drawn unless that panel has switched it off. They are filtered
 * by project as well, so revealing them cannot leave a component behind when
 * its project is filtered out.
 */

/** The specs drawing a project's overall boundary, as eao_style() names them. */
export const FOOTPRINT_SPEC_IDS = ["footprint-fill", "footprint-outline"];

/** The specs drawing everything that is not a boundary. */
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
  revealedFeatureIds: readonly string[],
  hiddenFeatureIds: readonly string[],
): Record<string, unknown> => {
  const filters: Record<string, unknown> = {};

  // Spread into a literal: MapLibre compares against a value, and a readonly
  // array is not one it will accept.
  const onVisibleProject: unknown = [
    "in",
    ["get", "track_id"],
    ["literal", [...visibleTrackIds]],
  ];

  const footprint: unknown = hiddenFeatureIds.length
    ? [
        "all",
        onVisibleProject,
        ["!", ["in", ["get", "feature_id"], ["literal", [...hiddenFeatureIds]]]],
      ]
    : onVisibleProject;
  FOOTPRINT_SPEC_IDS.forEach((id) => {
    filters[id] = footprint;
  });

  const revealed: unknown = [
    "in",
    ["get", "feature_id"],
    ["literal", [...revealedFeatureIds]],
  ];
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
