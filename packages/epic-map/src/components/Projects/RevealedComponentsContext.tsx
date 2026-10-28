import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface RevealedComponents {
  featureIds: readonly string[];
  setFeatureIds: (ids: readonly string[]) => void;
  hiddenFeatureIds: readonly string[];
  setHiddenFeatureIds: (ids: readonly string[]) => void;
  selectedFeatureIds: readonly string[];
  setSelectedFeatureIds: (ids: readonly string[]) => void;
}

/**
 * Shared between the project panel, which switches components on and off and
 * selects one, and the EAO layer, which draws them
 *
 * The default reveals nothing, which is right wherever no panel is mounted.
 */
const RevealedComponentsContext = createContext<RevealedComponents>({
  featureIds: [],
  setFeatureIds: () => {},
  hiddenFeatureIds: [],
  setHiddenFeatureIds: () => {},
  selectedFeatureIds: [],
  setSelectedFeatureIds: () => {},
});

export const RevealedComponentsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [featureIds, setFeatureIds] = useState<readonly string[]>([]);
  const [hiddenFeatureIds, setHiddenFeatureIds] = useState<readonly string[]>(
    [],
  );
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<
    readonly string[]
  >([]);
  const value = useMemo(
    () => ({
      featureIds,
      setFeatureIds,
      hiddenFeatureIds,
      setHiddenFeatureIds,
      selectedFeatureIds,
      setSelectedFeatureIds,
    }),
    [featureIds, hiddenFeatureIds, selectedFeatureIds],
  );

  return (
    <RevealedComponentsContext.Provider value={value}>
      {children}
    </RevealedComponentsContext.Provider>
  );
};

export const useRevealedComponents = () =>
  useContext(RevealedComponentsContext);
