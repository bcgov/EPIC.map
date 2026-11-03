import type { AppliedLayer } from "@/api/useAppliedLayers";
import type { FavouriteLayer } from "@/api/useFavouriteLayers";
import type { ImportedLayer } from "@/api/useImportedLayers";
import type {
  WhatsHereKind,
  WhatsHereLayerResult,
  WhatsHereRequest,
} from "@/api/useWhatsHere";
import type { ResultGroup } from "@/components/MapTools/SelectAreaContext";
import { EAO_OBJECT_NAME, HOSTED_LAYERS, localLayerId } from "@/utils/localLayers";

export interface SearchedLayer {
  kind: WhatsHereKind;
  /** Object name, or imported layer id. */
  layer: string;
  layerId: string;
  objectName: string | null;
  name: string;
}

/** Switched-on layers, except EAO's own. */
export const searchedLayers = ({
  appliedLayers,
  favourites,
  visibleIds,
  importedLayers,
  importedShownIds,
}: {
  appliedLayers: readonly AppliedLayer[];
  favourites: readonly FavouriteLayer[];
  visibleIds: ReadonlySet<string>;
  importedLayers: readonly ImportedLayer[];
  importedShownIds: ReadonlySet<string>;
}): SearchedLayer[] => [
  ...appliedLayers
    .filter((layer) => layer.objectName && visibleIds.has(layer.id))
    .map((layer) => ({
      kind: "catalogue" as const,
      layer: layer.objectName as string,
      layerId: layer.id,
      objectName: layer.objectName,
      name: layer.name,
    })),
  ...HOSTED_LAYERS.filter(({ objectName }) => objectName !== EAO_OBJECT_NAME)
    .map(({ objectName }) => ({
      objectName,
      layerId: localLayerId(objectName),
    }))
    .filter(({ layerId }) => visibleIds.has(layerId))
    .map(({ objectName, layerId }) => ({
      kind: "hosted" as const,
      layer: objectName,
      layerId,
      objectName,
      name: favourites.find(({ id }) => id === layerId)?.name ?? objectName,
    })),
  ...importedLayers
    .filter(({ id }) => importedShownIds.has(id))
    .map(({ id, name }) => ({
      kind: "imported" as const,
      layer: id,
      layerId: id,
      objectName: null,
      name,
    })),
];

export const whatsHereRequest = (
  selection: readonly string[],
  layers: readonly SearchedLayer[],
): WhatsHereRequest => {
  const of = (kind: WhatsHereKind) =>
    layers.filter((layer) => layer.kind === kind).map(({ layer }) => layer);
  return {
    selection: [...selection],
    catalogue: of("catalogue"),
    hosted: of("hosted"),
    imported: of("imported"),
  };
};

/** Groups for layers with results or errors; an unnamed feature takes its layer's name. */
export const toGroups = (
  results: readonly WhatsHereLayerResult[],
  layers: readonly SearchedLayer[],
): ResultGroup[] =>
  results.flatMap((result) => {
    const layer = layers.find(
      (candidate) => candidate.kind === result.kind && candidate.layer === result.layer,
    );
    if (!layer || result.status === "empty") return [];
    return [
      {
        key: `${result.kind}:${result.layer}`,
        kind: result.kind,
        layerId: layer.layerId,
        objectName: layer.objectName,
        name: layer.name,
        matched: result.matched,
        listed: result.features.length,
        error: result.status === "error" ? result.error ?? "This layer could not be searched." : null,
        features: result.features.map((feature, index) => ({
          key: feature.id ?? `${index}`,
          id: feature.id,
          name: feature.name?.trim() || layer.name,
          properties: feature.properties,
        })),
      },
    ];
  });
