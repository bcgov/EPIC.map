import { useMemo } from "react";
import { eaoSpecFilters } from "@/components/Layers/eaoVisibility";
import type { LocalLayerStyle } from "@/components/Layers/layerUtils";
import { useFilters } from "@/components/Filters/FiltersContext";
import { useHostedLayerSelection } from "@/components/Layers/useHostedLayerHighlight";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import { EAO_OBJECT_NAME } from "@/utils/localLayers";

const NO_FILTERS: Record<string, unknown> = {};

/**
 * The extra filter a hosted layer's specs take, beyond the style's own.
 *
 * Empty for every layer but EAO's, whose footprints follow the project dots
 * and whose components follow the open project's panel and the selection.
 * A hook rather than a prop so HostedLayer stays one component per layer and
 * does not have to know which of them has a reason.
 */
export const useHostedLayerFilters = (
  objectName: string,
  style: LocalLayerStyle | undefined,
): Record<string, unknown> => {
  // Called for every hosted layer, used by one: a hook cannot be conditional.
  const { visibleProjects } = useFilters();
  const { featureIds, hiddenFootprintIds } = useRevealedComponents();
  const selectedIds = useHostedLayerSelection(objectName);

  return useMemo(() => {
    if (objectName !== EAO_OBJECT_NAME || !style) return NO_FILTERS;
    // A selected feature stays drawn after the panel that revealed it closes.
    const selected = new Set(selectedIds);
    return eaoSpecFilters(
      style,
      visibleProjects.map((project) => project.id),
      [...new Set([...featureIds, ...selectedIds])],
      hiddenFootprintIds.filter((id) => !selected.has(id)),
    );
  }, [
    objectName,
    style,
    visibleProjects,
    featureIds,
    hiddenFootprintIds,
    selectedIds,
  ]);
};
