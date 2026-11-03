import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import type { LngLatPoint } from "@/components/MapTools/measure";

export interface MeasureState {
  points: readonly LngLatPoint[];
  /** Done was pressed. */
  finished: boolean;
}

export type MeasureAction =
  | { type: "add"; point: LngLatPoint }
  | { type: "undo" }
  | { type: "finish" }
  | { type: "clear" };

export const INITIAL_MEASURE: MeasureState = { points: [], finished: false };

export const measureReducer = (state: MeasureState, action: MeasureAction): MeasureState => {
  switch (action.type) {
    case "add":
      if (state.finished) return state;
      return { ...state, points: [...state.points, action.point] };
    case "undo":
      if (state.finished) return state;
      return { ...state, points: state.points.slice(0, -1) };
    case "finish":
      if (state.points.length < 2) return state;
      return { ...state, finished: true };
    case "clear":
      return INITIAL_MEASURE;
    default:
      return state;
  }
};

interface Measure extends MeasureState {
  /** Measure is on and clicks drop points. */
  placing: boolean;
  add: (point: LngLatPoint) => void;
  undo: () => void;
  finish: () => void;
  clear: () => void;
}

const noop = () => {};

const MeasureContext = createContext<Measure>({
  ...INITIAL_MEASURE,
  placing: false,
  add: noop,
  undo: noop,
  finish: noop,
  clear: noop,
});

export const MeasureProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(measureReducer, INITIAL_MEASURE);
  const placing = useSelectArea().tool === "measure" && !state.finished;

  const actions = useMemo(
    () => ({
      add: (point: LngLatPoint) => dispatch({ type: "add", point }),
      undo: () => dispatch({ type: "undo" }),
      finish: () => dispatch({ type: "finish" }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [],
  );

  const value = useMemo(() => ({ ...state, ...actions, placing }), [state, actions, placing]);

  return <MeasureContext.Provider value={value}>{children}</MeasureContext.Provider>;
};

export const useMeasure = () => useContext(MeasureContext);
