import type {
  Map as MapLibreMap,
  TransformStyleFunction,
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  HIGHLIGHT_CASING_COLOR,
  HIGHLIGHT_CASING_WIDTH_PX,
  HIGHLIGHT_COLOR,
  HIGHLIGHT_FILL_OPACITY,
  HIGHLIGHT_POINT_SIZE_PX,
  HIGHLIGHT_WIDTH_PX,
  highlightTileUrl,
  MIN_ZOOM,
  outlineTileUrl,
  WIDGET_ID_PREFIX,
  WMS_MAX_LAYER_ZOOM,
  WMS_MIN_ZOOM,
  WMS_TILE_SIZE_PX,
  wmsTileUrl,
} from "@/utils/config";

/**
 * Everything the panel does to the map.
 *
 * A catalogue layer is on twice: the warehouse's raster, gated at the zoom its
 * style starts drawing at, and an outline covering every zoom below. They are
 * complements, so a change to where one stops moves where the other starts.
 */

// Style readiness

/** Runs `work` once the style is ready to accept sources and layers. */
export const whenStyleReady = (map: MapLibreMap, work: () => void) => {
  if (map.isStyleLoaded()) {
    work();
    return;
  }

  /*
  `isStyleLoaded()` is stricter than needed - it waits on in-view tiles and the
  sprite too - and 'load' fires once per map, so it never comes round again
  after a basemap switch.
  */
  const run = () => {
    map.off("styledata", run);
    map.off("idle", run);
    work();
  };

  map.on("styledata", run);
  map.on("idle", run);
};

/**
 * Like `whenStyleReady`, but without waiting on tiles: a filter change reloads
 * them, which would hold the work back until the map is idle.
 */
const whenStyleParsed = (map: MapLibreMap, work: () => void) => {
  // getStyle() is undefined until the style has loaded.
  if (map.getStyle()) {
    work();
    return;
  }
  whenStyleReady(map, work);
};

// The layer itself

/** Ids carry the widget's prefix so `carryWidgetLayers` keeps them. */
const wmsSourceId = (layerId: string) =>
  `${WIDGET_ID_PREFIX}wms-src-${layerId}`;
const wmsRasterId = (layerId: string) => `${WIDGET_ID_PREFIX}wms-${layerId}`;

/** MapLibre paints raster opacity as 0-1; the panel speaks percent. */
const toRasterOpacity = (percent: number) => percent / 100;

/**
 * Draw a catalogue layer, or reveal it if it is already on the map.
 */
export const showWmsLayer = (
  map: MapLibreMap,
  layer: CatalogueLayer,
  opacity: number,
) => {
  const { objectName } = layer;
  if (!objectName) return;

  whenStyleReady(map, () => {
    const source = wmsSourceId(layer.id);
    const raster = wmsRasterId(layer.id);

    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "visible");
      map.setPaintProperty(raster, "raster-opacity", toRasterOpacity(opacity));
      return;
    }

    if (!map.getSource(source)) {
      map.addSource(source, {
        type: "raster",
        tiles: [wmsTileUrl(objectName)],
        tileSize: WMS_TILE_SIZE_PX,
      });
    }

    map.addLayer({
      id: raster,
      type: "raster",
      source,
      minzoom: WMS_MIN_ZOOM,
      paint: { "raster-opacity": toRasterOpacity(opacity) },
    });
  });
};

/**
 * Gate one layer on the zoom openmaps actually starts drawing it at.
 */
export const setWmsLayerMinZoom = (
  map: MapLibreMap,
  layerId: string,
  minZoom: number | null,
) => {
  whenStyleReady(map, () => {
    const raster = wmsRasterId(layerId);
    // `null` is a layer that draws at every zoom, which the map's own floor
    // then bounds; there is no zoom below it to gate on.
    if (map.getLayer(raster)) {
      map.setLayerZoomRange(raster, minZoom ?? MIN_ZOOM, WMS_MAX_LAYER_ZOOM);
    }
  });
};

/**
 * Repaint one layer at a new opacity.
 */
export const setWmsLayerOpacity = (
  map: MapLibreMap,
  layerId: string,
  opacity: number,
) => {
  whenStyleReady(map, () => {
    const raster = wmsRasterId(layerId);
    if (map.getLayer(raster)) {
      map.setPaintProperty(raster, "raster-opacity", toRasterOpacity(opacity));
    }
  });
};

export const hideWmsLayer = (map: MapLibreMap, layerId: string) => {
  whenStyleReady(map, () => {
    const raster = wmsRasterId(layerId);
    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "none");
    }
  });
};

// The layer's outline, for the zooms it cannot draw at

/**
 * A layer's own shapes, stroked and unfilled, for the zooms it cannot draw at.
 *
 * Below its published scale limit the panel would otherwise say a layer was on
 * while the map showed nothing. Same geometry, same warehouse, no scale limit:
 * the outline of the thing itself, not a box around it.
 *
 * The handoff is MapLibre's, not React's: the outline's maxzoom and the layer's
 * minzoom are the same number, so they swap on the frame the zoom crosses it -
 * faster than a render can answer.
 */

const outlineSourceId = (layerId: string) =>
  `${WIDGET_ID_PREFIX}outline-src-${layerId}`;
const outlineRasterId = (layerId: string) =>
  `${WIDGET_ID_PREFIX}outline-${layerId}`;

/** Draw a layer's outline, or reveal one already on the map. */
export const showOutlineLayer = (map: MapLibreMap, layer: CatalogueLayer) => {
  const { objectName } = layer;
  if (!objectName) return;

  whenStyleReady(map, () => {
    const source = outlineSourceId(layer.id);
    const raster = outlineRasterId(layer.id);

    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "visible");
      return;
    }

    if (!map.getSource(source)) {
      map.addSource(source, {
        type: "raster",
        tiles: [outlineTileUrl(objectName)],
        tileSize: WMS_TILE_SIZE_PX,
      });
    }

    map.addLayer({
      id: raster,
      type: "raster",
      source,
      // Provisional, like the layer's own floor: replaced by the published one
      // as soon as it arrives.
      maxzoom: WMS_MIN_ZOOM,
    });
  });
};

/**
 * Stop the outline where the layer itself starts.
 *
 * A layer with no scale limit draws everywhere, leaving no zoom to cover, and
 * MapLibre draws nothing when maxzoom equals minzoom - so no special case.
 */
export const setOutlineLayerMaxZoom = (
  map: MapLibreMap,
  layerId: string,
  minZoom: number | null,
) => {
  whenStyleReady(map, () => {
    const raster = outlineRasterId(layerId);
    if (map.getLayer(raster)) {
      map.setLayerZoomRange(raster, MIN_ZOOM, minZoom ?? MIN_ZOOM);
    }
  });
};

export const hideOutlineLayer = (map: MapLibreMap, layerId: string) => {
  whenStyleReady(map, () => {
    const raster = outlineRasterId(layerId);
    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "none");
    }
  });
};

// The feature a metadata click selected

const HIGHLIGHT_SOURCE = `${WIDGET_ID_PREFIX}highlight-src`;
const HIGHLIGHT_LAYERS = [
  "fill",
  "casing",
  "line",
  "point",
  "raster",
  // Drawn over a hosted layer's own vector source rather than this one's, so
  // these carry no geometry of their own - but they are cleared with the rest.
  "local-fill",
  "local-line",
  "local-point",
].map((part) => `${WIDGET_ID_PREFIX}highlight-${part}`);
const [
  HIGHLIGHT_FILL,
  HIGHLIGHT_CASING,
  HIGHLIGHT_LINE,
  HIGHLIGHT_POINT,
  HIGHLIGHT_RASTER,
  HIGHLIGHT_LOCAL_FILL,
  HIGHLIGHT_LOCAL_LINE,
  HIGHLIGHT_LOCAL_POINT,
] = HIGHLIGHT_LAYERS;

export interface FeatureHighlight {
  /** The warehouse layer it came from; null for an imported feature. */
  objectName: string | null;
  /** The warehouse's id for it, or null when that id is not stable. */
  featureId: string | null;
  /** Its shape, or null when it was too heavy for map-api to carry. */
  geometry: Geometry | null;
}

const removeHighlight = (map: MapLibreMap) => {
  for (const id of HIGHLIGHT_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(HIGHLIGHT_SOURCE)) map.removeSource(HIGHLIGHT_SOURCE);
};

/**
 * Outline one feature above everything else, replacing any other.
 *
 * From its geometry where map-api sent it, otherwise by id through the
 * warehouse's tiles. With neither, left undrawn rather than guessed at.
 */
export const showHighlight = (map: MapLibreMap, highlight: FeatureHighlight) => {
  whenStyleReady(map, () => {
    removeHighlight(map);
    const { geometry, featureId, objectName } = highlight;

    if (geometry) {
      map.addSource(HIGHLIGHT_SOURCE, {
        type: "geojson",
        data: { type: "Feature", geometry, properties: {} },
      });
      map.addLayer({
        id: HIGHLIGHT_FILL,
        type: "fill",
        source: HIGHLIGHT_SOURCE,
        paint: {
          "fill-color": HIGHLIGHT_COLOR,
          "fill-opacity": HIGHLIGHT_FILL_OPACITY,
        },
      });
      map.addLayer({
        id: HIGHLIGHT_CASING,
        type: "line",
        source: HIGHLIGHT_SOURCE,
        paint: {
          "line-color": HIGHLIGHT_CASING_COLOR,
          "line-width": HIGHLIGHT_CASING_WIDTH_PX,
        },
      });
      map.addLayer({
        id: HIGHLIGHT_LINE,
        type: "line",
        source: HIGHLIGHT_SOURCE,
        paint: {
          "line-color": HIGHLIGHT_COLOR,
          "line-width": HIGHLIGHT_WIDTH_PX,
        },
      });
      // Otherwise a dot lands on every vertex of a line.
      map.addLayer({
        id: HIGHLIGHT_POINT,
        type: "circle",
        source: HIGHLIGHT_SOURCE,
        filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
        paint: {
          "circle-radius": HIGHLIGHT_POINT_SIZE_PX / 2,
          "circle-color": HIGHLIGHT_COLOR,
          "circle-opacity": HIGHLIGHT_FILL_OPACITY,
          "circle-stroke-color": HIGHLIGHT_COLOR,
          "circle-stroke-width": HIGHLIGHT_WIDTH_PX,
        },
      });
      return;
    }

    if (objectName && featureId) {
      map.addSource(HIGHLIGHT_SOURCE, {
        type: "raster",
        tiles: [highlightTileUrl(objectName, featureId)],
        tileSize: WMS_TILE_SIZE_PX,
      });
      map.addLayer({
        id: HIGHLIGHT_RASTER,
        type: "raster",
        source: HIGHLIGHT_SOURCE,
      });
    }
  });
};

export const hideHighlight = (map: MapLibreMap) => {
  whenStyleReady(map, () => removeHighlight(map));
};

/** Features of a layer we host, as the highlight addresses them. */
export interface LocalFeatureHighlight {
  /** The hosted layer's id in the panel, which names its tile source. */
  layerId: string;
  /** The layer's name inside the vector tile. */
  sourceLayer: string;
  /** The tile property holding the key, and the keys to match on it. */
  keyProperty: string;
  keys: readonly string[];
}

/**
 * Outline features of a hosted layer, by filtering its own tiles.
 *
 * Not drawn from geometry, as a warehouse feature is: a vector tile clips
 * shapes at its edge, so the copy the client was handed is a few pieces of the
 * outline rather than the outline. Matching on the key in the tiles the map
 * already holds draws all of it, and keeps drawing all of it as the user pans
 * onto tiles that were never in view when they clicked.
 */
export const showLocalHighlight = (
  map: MapLibreMap,
  highlight: LocalFeatureHighlight,
) => {
  whenStyleReady(map, () => {
    removeHighlight(map);
    drawLocalHighlight(
      map,
      [HIGHLIGHT_LOCAL_FILL, HIGHLIGHT_LOCAL_LINE, HIGHLIGHT_LOCAL_POINT],
      highlight,
    );
  });
};

/** The fill, line and point layers one local highlight is drawn with. */
type LocalHighlightIds = readonly [string, string, string];

const drawLocalHighlight = (
  map: MapLibreMap,
  [fillId, lineId, pointId]: LocalHighlightIds,
  { layerId, sourceLayer, keyProperty, keys }: LocalFeatureHighlight,
) => {
  const source = localSourceId(layerId);
  if (!map.getSource(source)) return;

  const filter: unknown = ["in", ["get", keyProperty], ["literal", [...keys]]];
  const shared = { source, "source-layer": sourceLayer, filter } as const;

  map.addLayer({
    ...shared,
    id: fillId,
    type: "fill",
    paint: {
      "fill-color": HIGHLIGHT_COLOR,
      "fill-opacity": HIGHLIGHT_FILL_OPACITY,
    },
  } as Parameters<MapLibreMap["addLayer"]>[0]);
  map.addLayer({
    ...shared,
    id: lineId,
    type: "line",
    paint: {
      "line-color": HIGHLIGHT_COLOR,
      "line-width": HIGHLIGHT_WIDTH_PX,
    },
  } as Parameters<MapLibreMap["addLayer"]>[0]);
  // Points only: a circle layer would otherwise dot every vertex of a shape.
  map.addLayer({
    ...shared,
    id: pointId,
    type: "circle",
    filter: ["all", filter, ["==", ["geometry-type"], "Point"]],
    paint: {
      "circle-radius": HIGHLIGHT_POINT_SIZE_PX / 2,
      "circle-color": HIGHLIGHT_COLOR,
      "circle-opacity": HIGHLIGHT_FILL_OPACITY,
      "circle-stroke-color": HIGHLIGHT_COLOR,
      "circle-stroke-width": HIGHLIGHT_WIDTH_PX,
    },
  } as Parameters<MapLibreMap["addLayer"]>[0]);
};

// The component the project panel selected

/**
 * Apart from the metadata highlight, so a map click and the panel's selection
 * cannot clear each other.
 */
const COMPONENT_HIGHLIGHT_LAYERS: LocalHighlightIds = [
  `${WIDGET_ID_PREFIX}component-highlight-fill`,
  `${WIDGET_ID_PREFIX}component-highlight-line`,
  `${WIDGET_ID_PREFIX}component-highlight-point`,
];

const removeComponentHighlight = (map: MapLibreMap) => {
  for (const id of COMPONENT_HIGHLIGHT_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
};

export const showComponentHighlight = (
  map: MapLibreMap,
  highlight: LocalFeatureHighlight,
) => {
  whenStyleParsed(map, () => {
    removeComponentHighlight(map);
    drawLocalHighlight(map, COMPONENT_HIGHLIGHT_LAYERS, highlight);
  });
};

export const hideComponentHighlight = (map: MapLibreMap) => {
  whenStyleParsed(map, () => removeComponentHighlight(map));
};

/**
 * Every MapLibre layer currently drawing a hosted layer.
 *
 * What a click is tested against: the hosted layer is several of them - a fill
 * under its own outline - and a feature hit in any one of them is the same
 * feature.
 */
export const localDrawnIds = (
  map: MapLibreMap,
  layerId: string,
): string[] => {
  const prefix = `${WIDGET_ID_PREFIX}local-${layerId}-`;
  return (map.getStyle()?.layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith(prefix));
};

// Layers map-api hosts itself, drawn from vector tiles

/**
 * A catalogue layer is a picture openmaps drew; this is geometry we draw, from
 * a style translated out of the .lyrx. That is why these carry a paint
 * expression where the WMS pair above carry only opacity.
 */
const localSourceId = (layerId: string) =>
  `${WIDGET_ID_PREFIX}local-src-${layerId}`;
/**
 * One drawn layer's id, suffixed with the spec's: a hosted layer is several
 * MapLibre layers, a fill under a line with points a circle beside both.
 */
const localDrawnId = (layerId: string, specId: string) =>
  `${WIDGET_ID_PREFIX}local-${layerId}-${specId}`;

/** One MapLibre layer drawn from a hosted layer's tiles. */
export interface LocalLayerSpec {
  id: string;
  type: "fill" | "line" | "circle";
  sourceLayer: string;
  minZoom?: number | null;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint: Record<string, unknown>;
}

/**
 * How map-api says a hosted layer should be drawn.
 *
 * `layers` is in draw order, first at the bottom. The server decides it,
 * following from the symbology; the client only preserves it.
 */
export interface LocalLayerStyle {
  source: {
    minZoom: number | null;
    maxZoom: number;
  };
  layers: LocalLayerSpec[];
}

const HIT_SPEC_SUFFIX = "-hit";

/** A layer to draw, and the spec it takes its client filter from. */
interface DrawnSpec {
  spec: LocalLayerSpec;
  filterKey: string;
}

/**
 * A transparent fill under an outline-only polygon layer (MAP-84).
 *
 * A click is tested against what MapLibre drew, and a fill at zero opacity
 * still hit-tests. One per line spec, carrying its source layer, floor and
 * filter; none where the style already fills that tile layer.
 */
const hitTargetSpecs = (style: LocalLayerStyle): DrawnSpec[] => {
  const filled = new Set(
    style.layers
      .filter((spec) => spec.type === "fill")
      .map((spec) => spec.sourceLayer),
  );

  return style.layers
    .filter((spec) => spec.type === "line" && !filled.has(spec.sourceLayer))
    .map((spec) => ({
      filterKey: spec.id,
      spec: {
        id: `${spec.id}${HIT_SPEC_SUFFIX}`,
        type: "fill" as const,
        sourceLayer: spec.sourceLayer,
        minZoom: spec.minZoom,
        filter: spec.filter,
        // Not the outline's layout, which a fill rejects.
        paint: { "fill-opacity": 0 },
      },
    }));
};

/** Every layer a hosted style draws, each hit target under its own outline. */
const drawnSpecs = (style: LocalLayerStyle): DrawnSpec[] => {
  const hits = hitTargetSpecs(style);
  return style.layers.flatMap((spec) => [
    ...hits.filter((hit) => hit.filterKey === spec.id),
    { spec, filterKey: spec.id },
  ]);
};

/**
 * The zoom a hosted layer starts drawing at, gated as `showLocalVectorLayer`
 * gates it: the shallowest zoom any spec draws at, never below the source's
 * floor, since under that there is no tile. MIN_ZOOM means no floor.
 */
export const localStyleFloor = (style: LocalLayerStyle): number => {
  const source = style.source.minZoom ?? MIN_ZOOM;
  if (!style.layers.length) return source;
  return Math.min(
    ...style.layers.map((spec) => Math.max(spec.minZoom ?? source, source)),
  );
};

/**
 * Layer types that paint the ground rather than label it. `symbol` and
 * `circle` are the basemap's labels, and staying under those is the point.
 */
const GROUND_LAYER_TYPES: ReadonlySet<string> = new Set([
  "background",
  "fill",
  "line",
  "raster",
  "fill-extrusion",
  "hillshade",
  "heatmap",
]);

/**
 * Index of the first layer in a style's trailing block of labels.
 *
 * Walks back to the last layer that paints the ground, rather than forward to
 * the first `symbol`: those agree only for a labels-last style, which Mapbox
 * and MapTiler are and the BC Basemap is not. It opens with eight placeholder
 * label layers, so "first symbol" is index 0 and anything before it lands
 * under 240 basemap layers.
 *
 * Returns `layers.length` for a style that labels nothing, which appends.
 *
 * Takes the basemap's own layers, never the live style's: the widget appends
 * above the labels, so a live style's last ground layer is the widget's own.
 */
export const labelBlockStart = (
  layers: readonly { readonly type?: string }[],
): number => {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (GROUND_LAYER_TYPES.has(layers[index]?.type ?? "")) return index + 1;
  }
  // Nothing paints the ground, so every layer here is a label to stay under.
  return 0;
};

/**
 * The basemap layer a widget layer should be inserted before, if any.
 *
 * `undefined` where the label block is empty, which MapLibre reads as "on top".
 */
const beforeLabelBlock = (map: MapLibreMap): string | undefined => {
  // The widget's own layers are filtered out: they sit above the basemap's
  // labels, so counting them would put this above the place names.
  const basemap = (map.getStyle()?.layers ?? []).filter(
    (layer) => !layer.id.startsWith(WIDGET_ID_PREFIX),
  );
  return basemap[labelBlockStart(basemap)]?.id;
};

/**
 * Draw a layer we host, or reveal it if it is already on the map.
 *
 * The source is gated at the style's floor as well as the layer, so no tile is
 * requested for a zoom it would not draw at: the server builds each one.
 */
export const showLocalVectorLayer = (
  map: MapLibreMap,
  layerId: string,
  tileUrl: string,
  style: LocalLayerStyle,
) => {
  whenStyleReady(map, () => {
    const source = localSourceId(layerId);

    if (!map.getSource(source)) {
      map.addSource(source, {
        type: "vector",
        tiles: [tileUrl],
        minzoom: style.source.minZoom ?? MIN_ZOOM,
        maxzoom: style.source.maxZoom,
      });
    }

    // Read once: adding before it does not move it, so the specs keep their
    // order among themselves.
    const before = beforeLabelBlock(map);

    drawnSpecs(style).forEach(({ spec }) => {
      const drawn = localDrawnId(layerId, spec.id);

      if (map.getLayer(drawn)) {
        map.setLayoutProperty(drawn, "visibility", "visible");
        return;
      }

      // The layer's own floor where it sets one, the source's otherwise. Both
      // are gated: the source stops the fetch, the layer stops the draw, so a
      // layer starting deeper than its source says so without moving it.
      const minzoom = spec.minZoom ?? style.source.minZoom;

      map.addLayer(
        {
          id: drawn,
          type: spec.type,
          source,
          "source-layer": spec.sourceLayer,
          ...(minzoom == null ? {} : { minzoom }),
          ...(spec.filter == null ? {} : { filter: spec.filter }),
          layout: { visibility: "visible", ...(spec.layout ?? {}) },
          paint: spec.paint,
          // MapLibre's own types are narrower than the union of what a fill, a
          // line and a circle layer accept; the server decided this shape.
        } as Parameters<MapLibreMap["addLayer"]>[0],
        before,
      );
    });
  });
};

/**
 * Scale a hosted layer's drawn opacity by the user's setting.
 *
 * Multiplied rather than assigned: the style's own opacity is part of the
 * symbology - a translucent fill under its own outline - so setting it to the
 * slider's value outright would paint over a decision the .lyrx made. 100%
 * means "as the layer is meant to look", which is the same promise the raster
 * slider makes for a warehouse layer.
 *
 * Takes the style because the base opacities are in it: MapLibre reports the
 * current value, so reading it back would compound every move of the slider.
 *
 * The style's own specs: a hit target has no appearance to scale.
 */
export const setLocalVectorLayerOpacity = (
  map: MapLibreMap,
  layerId: string,
  style: LocalLayerStyle,
  percent: number,
) => {
  whenStyleReady(map, () => {
    style.layers.forEach((spec) => {
      const drawn = localDrawnId(layerId, spec.id);
      if (!map.getLayer(drawn)) return;

      // "fill-opacity", "line-opacity" or "circle-opacity" - one per layer type
      // this style can carry, which MapLibre's types cannot narrow from here.
      const property = `${spec.type}-opacity` as Parameters<
        MapLibreMap["setPaintProperty"]
      >[1];
      const base = spec.paint[property];
      map.setPaintProperty(
        drawn,
        property,
        (typeof base === "number" ? base : 1) * (percent / 100),
      );
    });
  });
};

/**
 * Stroke a hosted layer's outlines at the width the user asked for.
 *
 * Assigned, not scaled like the opacity above, so the px shown is the px
 * drawn. Fills and circles keep the symbology the style gave them.
 */
export const setLocalVectorLayerLineWidth = (
  map: MapLibreMap,
  layerId: string,
  style: LocalLayerStyle,
  pixels: number,
) => {
  whenStyleReady(map, () => {
    style.layers.forEach((spec) => {
      if (spec.type !== "line") return;

      const drawn = localDrawnId(layerId, spec.id);
      if (!map.getLayer(drawn)) return;

      map.setPaintProperty(drawn, "line-width", pixels);
    });
  });
};

/**
 * Narrow what a hosted layer draws, without disturbing its symbology.
 *
 * The style's own filter decides which features a spec is *for* - a fill for
 * polygons, a circle for points - and is the server's. This adds the client's
 * reason on top of it, so the two cannot overwrite each other: a spec given no
 * extra filter keeps the style's unchanged.
 *
 * A hit target takes its outline's filter, so identify cannot outlive the draw.
 */
export const setLocalVectorLayerFilters = (
  map: MapLibreMap,
  layerId: string,
  style: LocalLayerStyle,
  extra: Record<string, unknown>,
) => {
  whenStyleReady(map, () => {
    drawnSpecs(style).forEach(({ spec, filterKey }) => {
      const drawn = localDrawnId(layerId, spec.id);
      if (!map.getLayer(drawn)) return;

      const own = spec.filter ?? null;
      const added = extra[filterKey] ?? null;
      const combined =
        own && added ? ["all", own, added] : (added ?? own ?? null);

      // MapLibre's types describe a filter more narrowly than the union of
      // what the server may send and what is added here.
      map.setFilter(
        drawn,
        (combined ?? undefined) as Parameters<MapLibreMap["setFilter"]>[1],
      );
    });
  });
};

/**
 * Take a hosted layer off the map, keeping its parsed tiles.
 *
 * Hidden rather than removed: turning it back on costs nothing and the parsed
 * tiles survive a basemap switch. Found by id prefix, so the caller need not
 * hold the style and a changed style cannot leave one layer of a set behind.
 */
export const hideLocalVectorLayer = (map: MapLibreMap, layerId: string) => {
  whenStyleReady(map, () => {
    const prefix = `${WIDGET_ID_PREFIX}local-${layerId}-`;
    (map.getStyle()?.layers ?? []).forEach((layer) => {
      if (layer.id.startsWith(prefix)) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    });
  });
};

/**
 * Carry the widget's own sources and layers onto an incoming basemap.
 */
export const carryWidgetLayers: TransformStyleFunction = (previous, next) => {
  if (!previous) return next;

  const sources = Object.fromEntries(
    Object.entries(previous.sources).filter(([id]) =>
      id.startsWith(WIDGET_ID_PREFIX),
    ),
  );
  const layers = previous.layers.filter((layer) =>
    layer.id.startsWith(WIDGET_ID_PREFIX),
  );

  // Spliced in at the start of the incoming basemap's label block, not
  // appended. Appending puts the widget's layers above the basemap's place
  // names, which is invisible for a thin outline and very visible once a layer
  // carries a translucent fill: the labels underneath it stop being readable.
  // Found by walking back from the last layer that paints the ground - see
  // labelBlockStart, and why the first `symbol` is the wrong end to look from.
  const at = labelBlockStart(next.layers);

  return {
    ...next,
    sources: { ...next.sources, ...sources },
    layers: [
      ...next.layers.slice(0, at),
      ...layers,
      ...next.layers.slice(at),
    ],
  };
};

/**
 * The map itself, and everything drawn over it.
 *
 * `onMapReady` hands the MapLibre instance up to the widget root, because one
 * control that needs it — the search field — lives in the bar above this
 * component rather than inside it. Called with the instance once it is built and
 * with null as it is torn down, so a holder above never keeps a removed map.
 */

// Which enabled layers the "Enabled layers" group lists

/**
 * Enabled layers minus the favourites. The group is for layers switched on
 * from search and left on; a favourite is listed, and switched, under
 * Favourites instead.
 */
export const withoutFavourites = <T extends { id: string }>(
  layers: readonly T[],
  favouriteIds: ReadonlySet<string>,
): T[] => layers.filter((layer) => !favouriteIds.has(layer.id));

// Which layers the current zoom cannot draw

/** A visible layer and the zoom below which openmaps will not draw it. */
export interface LayerFloor {
  id: string;
  floor: number;
}

/**
 * Which of `floors` the given zoom is too far out to draw.
 *
 * Returns `current` itself when the answer has not changed, and that identity
 * is the point: `zoom` fires every frame, but which layers sit below their
 * floor changes only when the zoom crosses one. The result is read through
 * context by every row, so a fresh Set per frame re-renders all of them.
 */
export const layersBelowFloor = (
  floors: readonly LayerFloor[],
  zoom: number,
  current: ReadonlySet<string>,
): ReadonlySet<string> => {
  const next = new Set<string>();
  for (const { id, floor } of floors) {
    if (zoom < floor) next.add(id);
  }

  if (next.size !== current.size) return next;
  for (const id of next) {
    if (!current.has(id)) return next;
  }
  return current;
};

// Layers the user imported

/**
 * An imported layer is drawn from its own features: they came from the user's
 * file and no warehouse serves them. Styled as the import preview drew them.
 */

const IMPORTED_PREFIX = `${WIDGET_ID_PREFIX}imported-`;
const importedSourceId = (layerId: string) =>
  `${IMPORTED_PREFIX}src-${layerId}`;
const IMPORTED_PARTS = ["fill", "line", "point"] as const;
const importedLayerId = (
  layerId: string,
  part: (typeof IMPORTED_PARTS)[number],
) => `${IMPORTED_PREFIX}${part}-${layerId}`;

/** The map layers one imported layer is drawn with. */
export const importedStyleLayerIds = (layerId: string): string[] =>
  IMPORTED_PARTS.map((part) => importedLayerId(layerId, part));

/** The imported layer a map layer draws, or null for any other map layer. */
export const importedLayerIdOf = (styleLayerId: string): string | null => {
  for (const part of IMPORTED_PARTS) {
    const prefix = `${IMPORTED_PREFIX}${part}-`;
    if (styleLayerId.startsWith(prefix)) return styleLayerId.slice(prefix.length);
  }
  return null;
};

export interface ImportedLayerColors {
  line: string;
  fill: string;
}

/** Every paint property opacity scales, by the part it belongs to. */
const IMPORTED_OPACITY_PROPERTIES = [
  ["fill", "fill-opacity"],
  ["line", "line-opacity"],
  ["point", "circle-opacity"],
  ["point", "circle-stroke-opacity"],
] as const;

/** Those properties at the given percent, as a paint block per part. */
const importedOpacityPaint = (percent: number) => {
  const opacity = percent / 100;
  return {
    fill: { "fill-opacity": opacity },
    line: { "line-opacity": opacity },
    point: { "circle-opacity": opacity, "circle-stroke-opacity": opacity },
  } as const;
};

/** Draw an imported layer, once. A layer already on the map is left as it is. */
export const showImportedLayer = (
  map: MapLibreMap,
  layerId: string,
  features: FeatureCollection,
  colors: ImportedLayerColors,
  opacity: number,
) => {
  whenStyleReady(map, () => {
    const source = importedSourceId(layerId);
    if (map.getSource(source)) return;

    map.addSource(source, { type: "geojson", data: features });
    // Under a selected feature's highlight, which has to stay readable on top.
    const beneath = map.getLayer(HIGHLIGHT_FILL) ? HIGHLIGHT_FILL : undefined;
    const paint = importedOpacityPaint(opacity);

    map.addLayer(
      {
        id: importedLayerId(layerId, "fill"),
        type: "fill",
        source,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": colors.fill, ...paint.fill },
      },
      beneath,
    );
    map.addLayer(
      {
        id: importedLayerId(layerId, "line"),
        type: "line",
        source,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": colors.line, "line-width": 2, ...paint.line },
      },
      beneath,
    );
    map.addLayer(
      {
        id: importedLayerId(layerId, "point"),
        type: "circle",
        source,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": colors.fill,
          "circle-stroke-color": colors.line,
          "circle-stroke-width": 2,
          ...paint.point,
        },
      },
      beneath,
    );
  });
};

/** Show or hide an imported layer, hidden rather than removed. */
export const setImportedLayerVisibility = (
  map: MapLibreMap,
  layerId: string,
  visible: boolean,
) => {
  whenStyleReady(map, () => {
    for (const id of importedStyleLayerIds(layerId)) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
};

/** Repaint an imported layer at a new opacity, as a percent. */
export const setImportedLayerOpacity = (
  map: MapLibreMap,
  layerId: string,
  opacity: number,
) => {
  whenStyleReady(map, () => {
    for (const [part, property] of IMPORTED_OPACITY_PROPERTIES) {
      const id = importedLayerId(layerId, part);
      if (map.getLayer(id)) map.setPaintProperty(id, property, opacity / 100);
    }
  });
};

/** Take an imported layer off the map, features and all. */
export const removeImportedLayer = (map: MapLibreMap, layerId: string) => {
  whenStyleReady(map, () => {
    for (const id of importedStyleLayerIds(layerId)) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    const source = importedSourceId(layerId);
    if (map.getSource(source)) map.removeSource(source);
  });
};
