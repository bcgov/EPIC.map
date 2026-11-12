import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  LngLat,
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { whenStyleParsed } from "@/components/Layers/layerUtils";
import {
  MEASURE_CLOSING_COLOR,
  MEASURE_COLOR,
  MEASURE_FILL_OPACITY,
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

// MapLibre's distanceTo radius, so areas agree with lengths.
const EARTH_RADIUS_M = 6371008.8;

/** Square metres inside the points, joined back to the first. */
export const polygonArea = (points: readonly LngLatPoint[]) => {
  if (points.length < 3) return 0;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const total = points.reduce((sum, [, lat], i) => {
    const [before] = points[(i + points.length - 1) % points.length];
    const [after] = points[(i + 1) % points.length];
    return sum + rad(after - before) * Math.sin(rad(lat));
  }, 0);
  return Math.abs((total * EARTH_RADIUS_M ** 2) / 2);
};

const twoFigures = new Intl.NumberFormat("en-CA", { maximumSignificantDigits: 2 });

/** Two significant figures, to avoid false precision. */
export const formatDistance = (metres: number) => {
  const rounded = Math.round(Number(metres.toPrecision(2)));
  if (rounded === 0) return "0 km";
  return rounded < 1000
    ? `${twoFigures.format(rounded)} m`
    : `${twoFigures.format(rounded / 1000)} km`;
};

// The ticket's 1 dp and whole km², then three figures from 100 km².
const areaFormats = [
  { maximumFractionDigits: 1 },
  { maximumFractionDigits: 0 },
  { maximumSignificantDigits: 3 },
].map((options) => new Intl.NumberFormat("en-CA", options));

/** m² to two figures under 1 km², then km² with fewer decimals as it grows. */
export const formatArea = (squareMetres: number) => {
  const rounded = Math.round(Number(squareMetres.toPrecision(2)));
  if (rounded < 1_000_000) return `${twoFigures.format(rounded)} m²`;
  const km2 = squareMetres / 1e6;
  const format = areaFormats[km2 < 10 ? 0 : km2 < 100 ? 1 : 2];
  return `${format.format(km2)} km²`;
};

/** A line, a line that can close back to Point 1, or a closed area. */
export type MeasureShape = "open" | "closable" | "closed";

type Part = "fill" | "closing" | "line" | "point";

const SOURCE = `${WIDGET_ID_PREFIX}measure-src`;
const [FILL, CLOSING, LINE, POINT] = (["fill", "closing", "line", "point"] as const).map(
  (part) => `${WIDGET_ID_PREFIX}measure-${part}`,
);

const ofPart = (part: Part): FilterSpecification => ["==", ["get", "part"], part];

const feature = (part: Part, geometry: Geometry, preview = false): Feature => ({
  type: "Feature",
  geometry,
  properties: preview ? { part, preview } : { part },
});

const line = (part: Part, points: readonly LngLatPoint[], preview = false) =>
  feature(part, { type: "LineString", coordinates: [...points] }, preview);

export const drawMeasure = (
  map: MapLibreMap,
  points: readonly LngLatPoint[],
  preview: readonly LngLatPoint[] | null,
  shape: MeasureShape,
) => {
  const ring = shape === "closed" ? [...points, points[0]] : points;
  const data: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...(shape === "closed"
        ? [feature("fill", { type: "Polygon", coordinates: [[...ring]] })]
        : []),
      ...(shape === "closable" ? [line("closing", [points[points.length - 1], points[0]])] : []),
      ...(ring.length > 1 ? [line("line", ring)] : []),
      ...(preview ? [line("line", preview, true)] : []),
      ...points.map((coordinates) => feature("point", { type: "Point", coordinates })),
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
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SOURCE,
      filter: ofPart("fill"),
      paint: { "fill-color": MEASURE_COLOR, "fill-opacity": MEASURE_FILL_OPACITY },
    });
    map.addLayer({
      id: CLOSING,
      type: "line",
      source: SOURCE,
      filter: ofPart("closing"),
      paint: {
        "line-color": MEASURE_CLOSING_COLOR,
        "line-width": MEASURE_WIDTH_PX,
        "line-dasharray": [2, 2],
      },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SOURCE,
      filter: ofPart("line"),
      paint: {
        "line-color": MEASURE_COLOR,
        "line-width": MEASURE_WIDTH_PX,
        "line-dasharray": [2, 2],
        // The segment out to the cursor is dimmer than the placed ones.
        "line-opacity": ["case", ["has", "preview"], MEASURE_PREVIEW_OPACITY, 1],
      },
    });
    map.addLayer({
      id: POINT,
      type: "circle",
      source: SOURCE,
      filter: ofPart("point"),
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
    for (const id of [POINT, LINE, CLOSING, FILL]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  });
};
