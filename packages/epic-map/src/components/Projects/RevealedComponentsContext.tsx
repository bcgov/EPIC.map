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
}

/**
 * Shared between the project panel, which switches components on, and the
 * EAO layer, which draws them - two branches of the map surface's tree.
 *
 * The default reveals nothing, which is right wherever no panel is mounted.
 */
const RevealedComponentsContext = createContext<RevealedComponents>({
  featureIds: [],
  setFeatureIds: () => {},
});

export const RevealedComponentsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [featureIds, setFeatureIds] = useState<readonly string[]>([]);
  const value = useMemo(() => ({ featureIds, setFeatureIds }), [featureIds]);

  return (
    <RevealedComponentsContext.Provider value={value}>
      {children}
    </RevealedComponentsContext.Provider>
  );
};

export const useRevealedComponents = () =>
  useContext(RevealedComponentsContext);
