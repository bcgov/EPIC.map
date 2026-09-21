// The widget's public contract lives in @bcgov/epic-map-types, the copy of which
// hosts keep so they can type a remote they never import. Re-exported here so
// widget source keeps reaching for "@/types" and the two can never drift.
export type {
  MapBasemapStyles,
  MapExtent,
  MapFeature,
  MapWidgetError,
  MapWidgetErrorKind,
  MapWidgetProps,
} from "@bcgov/epic-map-types";
