import { useMemo } from "react";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import { EAO_OBJECT_NAME } from "@/utils/localLayers";

const NONE: readonly string[] = [];

/** EAO features to highlight in navy: the focused Selected row, else the panel's component. */
export const useHostedLayerHighlight = (objectName: string): readonly string[] => {
  const { selectedFeatureIds } = useRevealedComponents();
  const { focusedId } = useSelectArea();

  return useMemo(() => {
    if (objectName !== EAO_OBJECT_NAME) return NONE;
    return focusedId ? [focusedId] : selectedFeatureIds;
  }, [objectName, focusedId, selectedFeatureIds]);
};

/** EAO features in the Select area selection. */
export const useHostedLayerSelection = (objectName: string): readonly string[] => {
  const { selected } = useSelectArea();

  return useMemo(
    () =>
      objectName === EAO_OBJECT_NAME
        ? selected.map(({ featureId }) => featureId)
        : NONE,
    [objectName, selected],
  );
};
