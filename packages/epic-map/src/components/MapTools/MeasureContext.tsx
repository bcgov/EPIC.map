import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import type { LngLatPoint } from "@/components/MapTools/measure";

export const AREA_MIN_POINTS = 3;

export interface MeasureState {
  points: readonly LngLatPoint[];
  /** Done was pressed or the shape closed. */
  finished: boolean;
  /** Point 1 was clicked to measure the area. */
  closed: boolean;
}

export type MeasureAction =
  | { type: "add"; point: LngLatPoint }
  | { type: "undo" }
  | { type: "finish" }
  | { type: "close" }
  | { type: "clear" };

export const INITIAL_MEASURE: MeasureState = { points: [], finished: false, closed: false };

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
    case "close":
      if (state.finished || state.points.length < AREA_MIN_POINTS) return state;
      return { ...state, finished: true, closed: true };
    case "clear":
      return INITIAL_MEASURE;
    default:
      return state;
  }
};

interface Measure extends MeasureState {
  /** Measure is on and clicks drop points. */
  placing: boolean;
  /** Placing, with enough points to close into an area. */
  closable: boolean;
  add: (point: LngLatPoint) => void;
  undo: () => void;
  finish: () => void;
  close: () => void;
  clear: () => void;
}

const noop = () => {};

const MeasureContext = createContext<Measure>({
  ...INITIAL_MEASURE,
  placing: false,
  closable: false,
  add: noop,
  undo: noop,
  finish: noop,
  close: noop,
  clear: noop,
});

export const MeasureProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(measureReducer, INITIAL_MEASURE);
  const placing = useSelectArea().tool === "measure" && !state.finished;
  const closable = placing && state.points.length >= AREA_MIN_POINTS;

  const actions = useMemo(
    () => ({
      add: (point: LngLatPoint) => dispatch({ type: "add", point }),
      undo: () => dispatch({ type: "undo" }),
      finish: () => dispatch({ type: "finish" }),
      close: () => dispatch({ type: "close" }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [],
  );

  const value = useMemo(
    () => ({ ...state, ...actions, placing, closable }),
    [state, actions, placing, closable],
  );

  return <MeasureContext.Provider value={value}>{children}</MeasureContext.Provider>;
};

export const useMeasure = () => useContext(MeasureContext);
