import type { LocalHighlightPaint } from "@/components/Layers/layerUtils";

/**
 * Each EAO style category's hue and its darker selected outline, keyed as
 * eao_categories.py writes `style_category`. Okabe-Ito: do not substitute.
 */
export const EAO_CATEGORY_COLORS: Record<
  string,
  { hue: string; selectedStroke: string }
> = {
  footprint: { hue: "#0072B2", selectedStroke: "#004E7A" },
  amendment: { hue: "#CC79A7", selectedStroke: "#8E4A70" },
  value_component: { hue: "#009E73", selectedStroke: "#006B4F" },
  project_component: { hue: "#E69F00", selectedStroke: "#8B3A00" },
};

/** The category every unmatched feature falls back to, as on the server. */
export const EAO_DEFAULT_CATEGORY = "project_component";

const byCategory = (pick: "hue" | "selectedStroke"): unknown => [
  "match",
  ["get", "style_category"],
  ...Object.entries(EAO_CATEGORY_COLORS)
    .filter(([category]) => category !== EAO_DEFAULT_CATEGORY)
    .flatMap(([category, colors]) => [category, colors[pick]]),
  EAO_CATEGORY_COLORS[EAO_DEFAULT_CATEGORY][pick],
];

const SELECTED_OPACITY = 0.6;

/** A selected EAO feature: its own hue fuller, outlined in a darker shade. */
export const EAO_SELECTED_PAINT: LocalHighlightPaint = {
  fill: {
    "fill-color": byCategory("hue"),
    "fill-opacity": SELECTED_OPACITY,
  },
  line: {
    "line-color": byCategory("selectedStroke"),
    "line-width": ["match", ["geometry-type"], "LineString", 4, 3],
  },
  point: {
    "circle-radius": 7,
    "circle-color": byCategory("hue"),
    "circle-opacity": SELECTED_OPACITY,
    "circle-stroke-color": byCategory("selectedStroke"),
    "circle-stroke-width": 3,
  },
};
