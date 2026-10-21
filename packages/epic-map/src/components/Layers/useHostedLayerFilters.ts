import { useMemo } from "react";
import { eaoSpecFilters } from "@/components/Layers/eaoVisibility";
import type { LocalLayerStyle } from "@/components/Layers/layerUtils";
import { useFilters } from "@/components/Filters/FiltersContext";
import { EAO_OBJECT_NAME } from "@/utils/localLayers";

/**
 * The extra filter a hosted layer's specs take, beyond the style's own.
 *
 * Empty for every layer but EAO's, whose footprints follow the project dots.
 * A hook rather than a prop so HostedLayer stays one component per layer and
 * does not have to know which of them has a reason.
 */
export const useHostedLayerFilters = (
  objectName: string,
  style: LocalLayerStyle | undefined,
): Record<string, unknown> => {
  // Called for every hosted layer, used by one: a hook cannot be conditional.
  const { visibleProjects } = useFilters();

  return useMemo(() => {
    if (objectName !== EAO_OBJECT_NAME || !style) return {};
    return eaoSpecFilters(
      style,
      visibleProjects.map((project) => project.id),
    );
  }, [objectName, style, visibleProjects]);
};
