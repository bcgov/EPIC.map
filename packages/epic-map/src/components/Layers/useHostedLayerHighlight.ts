import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import { EAO_OBJECT_NAME } from "@/utils/localLayers";

const NONE: readonly string[] = [];

/**
 * The features of a hosted layer to highlight: for EAO's, the component the
 * open project's panel selected. A hook for the reason useHostedLayerFilters is.
 */
export const useHostedLayerHighlight = (objectName: string): readonly string[] => {
  const { selectedFeatureIds } = useRevealedComponents();
  return objectName === EAO_OBJECT_NAME ? selectedFeatureIds : NONE;
};
