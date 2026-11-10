import { useMemo } from "react";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import { EAO_OBJECT_NAME } from "@/utils/localLayers";

const NONE: readonly string[] = [];

/** EAO features the panel's component highlight draws; none while a Selected row is focused. */
export const useHostedLayerHighlight = (objectName: string): readonly string[] => {
  const { selectedFeatureIds } = useRevealedComponents();
  const { focusedId } = useSelectArea();

  return useMemo(() => {
    if (objectName !== EAO_OBJECT_NAME || focusedId) return NONE;
    return selectedFeatureIds;
  }, [objectName, focusedId, selectedFeatureIds]);
};

/** The EAO feature of the focused Selected row, highlighted in gold as Identify does. */
export const useHostedLayerFocus = (objectName: string): string | null => {
  const { focusedId } = useSelectArea();
  return objectName === EAO_OBJECT_NAME ? focusedId : null;
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
