import type { Feature, FeatureCollection } from "geojson";
import {
  LngLat,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { whenStyleParsed } from "@/components/Layers/layerUtils";
import {
  MEASURE_COLOR,
  MEASURE_POINT_RADIUS_PX,
  MEASURE_PREVIEW_OPACITY,
  MEASURE_WIDTH_PX,
  WIDGET_ID_PREFIX,
} from "@/utils/config";

export type LngLatPoint = [lng: number, lat: number];

export const distance = (from: LngLatPoint, to: LngLatPoint) =>
  new LngLat(...from).distanceTo(new LngLat(...to));

/** Metres from each point to the next. */
export const segmentLengths = (points: readonly LngLatPoint[]) =>
  points.slice(1).map((point, i) => distance(points[i], point));

export const lineLength = (points: readonly LngLatPoint[]) =>
  segmentLengths(points).reduce((sum, metres) => sum + metres, 0);

const twoFigures = new Intl.NumberFormat("en-CA", { maximumSignificantDigits: 2 });

/** Two significant figures, to avoid false precision. */
export const formatDistance = (metres: number) => {
  const rounded = Math.round(Number(metres.toPrecision(2)));
  if (rounded === 0) return "0 km";
  return rounded < 1000
    ? `${twoFigures.format(rounded)} m`
    : `${twoFigures.format(rounded / 1000)} km`;
};

const SOURCE = `${WIDGET_ID_PREFIX}measure-src`;
const [CASING, LINE, POINT] = ["casing", "line", "point"].map(
  (part) => `${WIDGET_ID_PREFIX}measure-${part}`,
);

const line = (points: readonly LngLatPoint[], preview = false): Feature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: [...points] },
  properties: { preview },
});

const isLine: FilterSpecification = ["==", ["geometry-type"], "LineString"];

const lineOpacity: ExpressionSpecification = ["case", ["get", "preview"], MEASURE_PREVIEW_OPACITY, 1];

export const drawMeasure = (
  map: MapLibreMap,
  points: readonly LngLatPoint[],
  preview: readonly LngLatPoint[] | null,
) => {
  const data: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...(points.length > 1 ? [line(points)] : []),
      ...(preview ? [line(preview, true)] : []),
      ...points.map((coordinates): Feature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates },
        properties: {},
      })),
    ],
  };

  // No style check here: this runs on every mouse move.
  const source = map.getSource<GeoJSONSource>(SOURCE);
  if (source) {
    source.setData(data);
    return;
  }

  whenStyleParsed(map, () => {
    const added = map.getSource<GeoJSONSource>(SOURCE);
    if (added) {
      added.setData(data);
      return;
    }
    map.addSource(SOURCE, { type: "geojson", data });
    // White casing so the line reads on either basemap.
    map.addLayer({
      id: CASING,
      type: "line",
      source: SOURCE,
      filter: isLine,
      paint: {
        "line-color": "#FFFFFF",
        "line-width": MEASURE_WIDTH_PX + 2,
        "line-opacity": lineOpacity,
      },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SOURCE,
      filter: isLine,
      paint: {
        "line-color": MEASURE_COLOR,
        "line-width": MEASURE_WIDTH_PX,
        "line-dasharray": [2, 2],
        "line-opacity": lineOpacity,
      },
    });
    map.addLayer({
      id: POINT,
      type: "circle",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": MEASURE_POINT_RADIUS_PX,
        "circle-color": MEASURE_COLOR,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": MEASURE_WIDTH_PX,
      },
    });
  });
};

export const eraseMeasure = (map: MapLibreMap) => {
  whenStyleParsed(map, () => {
    for (const id of [POINT, LINE, CASING]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  });
};
