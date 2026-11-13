import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { FeatureAttribute } from "@/api/useMetaData";
import type { WhatsHereKind } from "@/api/useWhatsHere";

export type MapTool = "select" | "measure";

export interface SelectedFeature {
  featureId: string;
  label: string;
}

export interface ResultFeature {
  /** Unique within its group. */
  key: string;
  /** Null where the layer has no stable id. */
  id: string | null;
  name: string;
  properties: FeatureAttribute[];
}

export interface ResultGroup {
  /** Unique across groups. */
  key: string;
  kind: WhatsHereKind;
  /** The layer's id in the Layers panel. */
  layerId: string;
  /** Null for an imported layer. */
  objectName: string | null;
  name: string;
  features: ResultFeature[];
  /** May exceed `listed`. */
  matched: number;
  /** Count before any were removed. */
  listed: number;
  error: string | null;
}

/** The row whose feature is highlighted on the map. */
export type Focus =
  | { kind: "selected"; featureId: string }
  | { kind: "result"; groupKey: string; featureKey: string };

/** The result whose popup is open, and where, in map pixels. */
export interface InfoTarget {
  groupKey: string;
  featureKey: string;
  /** The popup's right edge. */
  right: number;
  top: number;
}

export interface SelectAreaState {
  tool: MapTool | null;
  selected: readonly SelectedFeature[];
  focused: Focus | null;
  /** Null until What's here runs. */
  results: readonly ResultGroup[] | null;
  /** The query in flight; an answer to any other is dropped. */
  queryId: number | null;
  queryError: string | null;
  info: InfoTarget | null;
}

export type SelectAreaAction =
  | { type: "toggleTool"; tool: MapTool }
  | { type: "add"; features: readonly SelectedFeature[] }
  | { type: "remove"; featureId: string }
  | { type: "clear" }
  | { type: "focus"; focus: Focus }
  | { type: "unfocus" }
  | { type: "startQuery"; queryId: number }
  | { type: "finishQuery"; queryId: number; groups: ResultGroup[] }
  | { type: "failQuery"; queryId: number; message: string }
  | { type: "removeResult"; groupKey: string; featureKey: string }
  | { type: "clearGroup"; groupKey: string }
  | { type: "showInfo"; target: InfoTarget }
  | { type: "hideInfo" };

const NONE: readonly SelectedFeature[] = [];

export const INITIAL_STATE: SelectAreaState = {
  tool: null,
  selected: NONE,
  focused: null,
  results: null,
  queryId: null,
  queryError: null,
  info: null,
};

const sameFocus = (a: Focus | null, b: Focus) =>
  a?.kind === "selected" && b.kind === "selected"
    ? a.featureId === b.featureId
    : a?.kind === "result" && b.kind === "result"
      ? a.groupKey === b.groupKey && a.featureKey === b.featureKey
      : false;

/** A changed selection discards its results. */
const withoutResults = (state: SelectAreaState): SelectAreaState => ({
  ...state,
  results: null,
  queryId: null,
  queryError: null,
  info: null,
  focused: state.focused?.kind === "result" ? null : state.focused,
});

/** Drops the focus and popup of removed results. */
const keepingTo = (
  state: SelectAreaState,
  gone: (groupKey: string, featureKey: string) => boolean,
): SelectAreaState => ({
  ...state,
  focused:
    state.focused?.kind === "result" &&
    gone(state.focused.groupKey, state.focused.featureKey)
      ? null
      : state.focused,
  info:
    state.info && gone(state.info.groupKey, state.info.featureKey)
      ? null
      : state.info,
});

export const selectAreaReducer = (
  state: SelectAreaState,
  action: SelectAreaAction,
): SelectAreaState => {
  switch (action.type) {
    case "toggleTool":
      // Leaving Select area discards everything.
      return {
        ...(state.tool === "select" ? INITIAL_STATE : state),
        tool: state.tool === action.tool ? null : action.tool,
      };
    case "add": {
      const held = new Set(state.selected.map(({ featureId }) => featureId));
      const added = action.features.filter(({ featureId }) => !held.has(featureId));
      if (added.length === 0) return state;
      return withoutResults({ ...state, selected: [...state.selected, ...added] });
    }
    case "remove":
      return withoutResults({
        ...state,
        selected: state.selected.filter(({ featureId }) => featureId !== action.featureId),
        focused:
          state.focused?.kind === "selected" && state.focused.featureId === action.featureId
            ? null
            : state.focused,
      });
    case "clear":
      return { ...INITIAL_STATE, tool: state.tool };
    case "focus":
      return { ...state, focused: sameFocus(state.focused, action.focus) ? null : action.focus };
    case "unfocus":
      return { ...state, focused: null };
    case "startQuery":
      return { ...withoutResults(state), queryId: action.queryId };
    case "finishQuery":
      if (state.queryId !== action.queryId) return state;
      return { ...state, queryId: null, results: action.groups };
    case "failQuery":
      if (state.queryId !== action.queryId) return state;
      return { ...state, queryId: null, queryError: action.message };
    case "removeResult": {
      if (!state.results) return state;
      const results = state.results
        .map((group) =>
          group.key === action.groupKey
            ? { ...group, features: group.features.filter(({ key }) => key !== action.featureKey) }
            : group,
        )
        // Drop emptied groups, but keep errors.
        .filter((group) => group.features.length > 0 || group.error);
      return keepingTo(
        { ...state, results },
        (groupKey, featureKey) =>
          groupKey === action.groupKey && featureKey === action.featureKey,
      );
    }
    case "clearGroup":
      if (!state.results) return state;
      return keepingTo(
        { ...state, results: state.results.filter(({ key }) => key !== action.groupKey) },
        (groupKey) => groupKey === action.groupKey,
      );
    case "showInfo":
      return { ...state, info: action.target };
    case "hideInfo":
      return { ...state, info: null };
    default:
      return state;
  }
};

interface SelectArea extends SelectAreaState {
  toggleTool: (tool: MapTool) => void;
  /** Skips any feature already in. */
  add: (...features: SelectedFeature[]) => void;
  remove: (featureId: string) => void;
  /** Clears selection, results and highlights. */
  clear: () => void;
  /** The focused Selected row, if any. */
  focusedId: string | null;
  /** Toggles the highlight on a selected feature. */
  focus: (featureId: string) => void;
  /** Toggles the gold highlight on a result. */
  focusResult: (groupKey: string, featureKey: string) => void;
  unfocus: () => void;
  /** Returns the id its answer must carry. */
  startQuery: () => number;
  finishQuery: (queryId: number, groups: ResultGroup[]) => void;
  failQuery: (queryId: number, message: string) => void;
  removeResult: (groupKey: string, featureKey: string) => void;
  clearGroup: (groupKey: string) => void;
  showInfo: (target: InfoTarget) => void;
  hideInfo: () => void;
}

const noop = () => {};

/** Select area state, shared by the tool bar, map clicks and the EAO layer. */
const SelectAreaContext = createContext<SelectArea>({
  ...INITIAL_STATE,
  toggleTool: noop,
  add: noop,
  remove: noop,
  clear: noop,
  focusedId: null,
  focus: noop,
  focusResult: noop,
  unfocus: noop,
  startQuery: () => 0,
  finishQuery: noop,
  failQuery: noop,
  removeResult: noop,
  clearGroup: noop,
  showInfo: noop,
  hideInfo: noop,
});

export const SelectAreaProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(selectAreaReducer, INITIAL_STATE);
  const queries = useRef(0);

  const startQuery = useCallback(() => {
    queries.current += 1;
    dispatch({ type: "startQuery", queryId: queries.current });
    return queries.current;
  }, []);

  const actions = useMemo(
    () => ({
      toggleTool: (tool: MapTool) => dispatch({ type: "toggleTool", tool }),
      add: (...features: SelectedFeature[]) => dispatch({ type: "add", features }),
      remove: (featureId: string) => dispatch({ type: "remove", featureId }),
      clear: () => dispatch({ type: "clear" }),
      focus: (featureId: string) =>
        dispatch({ type: "focus", focus: { kind: "selected", featureId } }),
      focusResult: (groupKey: string, featureKey: string) =>
        dispatch({ type: "focus", focus: { kind: "result", groupKey, featureKey } }),
      unfocus: () => dispatch({ type: "unfocus" }),
      startQuery,
      finishQuery: (queryId: number, groups: ResultGroup[]) =>
        dispatch({ type: "finishQuery", queryId, groups }),
      failQuery: (queryId: number, message: string) =>
        dispatch({ type: "failQuery", queryId, message }),
      removeResult: (groupKey: string, featureKey: string) =>
        dispatch({ type: "removeResult", groupKey, featureKey }),
      clearGroup: (groupKey: string) => dispatch({ type: "clearGroup", groupKey }),
      showInfo: (target: InfoTarget) => dispatch({ type: "showInfo", target }),
      hideInfo: () => dispatch({ type: "hideInfo" }),
    }),
    [startQuery],
  );

  const value = useMemo(
    () => ({
      ...state,
      ...actions,
      focusedId: state.focused?.kind === "selected" ? state.focused.featureId : null,
    }),
    [state, actions],
  );

  return (
    <SelectAreaContext.Provider value={value}>
      {children}
    </SelectAreaContext.Provider>
  );
};

export const useSelectArea = () => useContext(SelectAreaContext);
