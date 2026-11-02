import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MapTool = "select" | "measure";

export interface SelectedFeature {
  featureId: string;
  label: string;
}

interface SelectArea {
  tool: MapTool | null;
  toggleTool: (tool: MapTool) => void;
  selected: readonly SelectedFeature[];
  /** A no-op for a feature already in. */
  add: (feature: SelectedFeature) => void;
  remove: (featureId: string) => void;
  /** Clears the selection and its highlights. */
  clear: () => void;
  /** The focused Selected row, if any. */
  focusedId: string | null;
  /** Toggles the navy highlight on a selected feature. */
  focus: (featureId: string) => void;
  unfocus: () => void;
}

const NONE: readonly SelectedFeature[] = [];

/** Select area state, shared by the tool bar, map clicks and the EAO layer. */
const SelectAreaContext = createContext<SelectArea>({
  tool: null,
  toggleTool: () => {},
  selected: NONE,
  add: () => {},
  remove: () => {},
  clear: () => {},
  focusedId: null,
  focus: () => {},
  unfocus: () => {},
});

export const SelectAreaProvider = ({ children }: { children: ReactNode }) => {
  const [tool, setTool] = useState<MapTool | null>(null);
  const [selected, setSelected] = useState<readonly SelectedFeature[]>(NONE);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const clear = useCallback(() => {
    setSelected(NONE);
    setFocusedId(null);
  }, []);

  // Leaving Select area discards everything.
  const toggleTool = useCallback(
    (next: MapTool) => {
      if (tool === "select") clear();
      setTool(tool === next ? null : next);
    },
    [tool, clear],
  );

  const add = useCallback(
    (feature: SelectedFeature) =>
      setSelected((current) =>
        current.some(({ featureId }) => featureId === feature.featureId)
          ? current
          : [...current, feature],
      ),
    [],
  );

  const remove = useCallback((featureId: string) => {
    setSelected((current) =>
      current.filter((feature) => feature.featureId !== featureId),
    );
    setFocusedId((current) => (current === featureId ? null : current));
  }, []);

  const focus = useCallback(
    (featureId: string) =>
      setFocusedId((current) => (current === featureId ? null : featureId)),
    [],
  );

  const unfocus = useCallback(() => setFocusedId(null), []);

  const value = useMemo(
    () => ({
      tool,
      toggleTool,
      selected,
      add,
      remove,
      clear,
      focusedId,
      focus,
      unfocus,
    }),
    [tool, toggleTool, selected, add, remove, clear, focusedId, focus, unfocus],
  );

  return (
    <SelectAreaContext.Provider value={value}>
      {children}
    </SelectAreaContext.Provider>
  );
};

export const useSelectArea = () => useContext(SelectAreaContext);
