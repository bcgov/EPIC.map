// Public entry point for @bcgov/epic-map.
//
// maplibre-gl's stylesheet is imported here on purpose: Vite extracts it into the
// package's own `dist/epic-map.css`, so a host imports exactly one stylesheet
// (`@bcgov/epic-map/styles.css`) and never has to know maplibre is underneath.
import "maplibre-gl/dist/maplibre-gl.css";

export { MapWidget } from "@/widget/MapWidget";

export type {
  MapWidgetProps,
  MapFeature,
  MapExtent,
  MapWidgetError,
  MapWidgetErrorKind,
} from "@/types";
