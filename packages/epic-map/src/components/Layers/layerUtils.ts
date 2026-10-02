import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  MIN_ZOOM,
  outlineTileUrl,
  WIDGET_ID_PREFIX,
  WMS_MAX_LAYER_ZOOM,
  WMS_MIN_ZOOM,
  WMS_TILE_SIZE_PX,
  wmsTileUrl,
} from "@/utils/config";

/**
 * Everything the panel does to the map, and the one piece of reasoning behind
 * it that touches no map at all.
 *
 * A catalogue layer is on the map twice: as the warehouse's own raster, gated
 * at the zoom its published style starts drawing at, and as an outline of its
 * geometry covering every zoom below that. The two are complements, so they are
 * kept together - a change to where one stops is a change to where the other
 * starts.
 */

// Style readiness

/** Runs `work` once the style is ready to accept sources and layers. */
const whenStyleReady = (map: MapLibreMap, work: () => void) => {
  if (map.isStyleLoaded()) {
    work();
    return;
  }

  /*
  `isStyleLoaded()` is stricter than this needs: it also waits on every in-view
  tile and the sprite, so on a fresh load it stays false while the basemap
  downloads. 'load' is no use either way: it fires once per map, so it never comes round
  again after a basemap switch.
  */
  const run = () => {
    map.off("styledata", run);
    map.off("idle", run);
    work();
  };

  map.on("styledata", run);
  map.on("idle", run);
};

// The layer itself

/**
 * Source and layer ids carry the widget's prefix so that MapSurface's
 * `carryWidgetLayers` transform keeps them across a basemap switch.
 */
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
 * The layer itself is gated at the scale its published style stops drawing at,
 * so below that the panel could say a layer was on while the map showed nothing
 * of it anywhere. This is the same geometry rendered by the same warehouse
 * under a style with no scale limit: not a box around where the layer is, but
 * the outline of the thing itself.
 *
 * The handoff is left to MapLibre rather than run from React. An outline's
 * maxzoom is the layer's floor and the layer's minzoom is the same number, so
 * the two swap on the frame the zoom crosses it - a zoom gesture delivers a
 * frame every 16ms, which is faster than a render can answer it.
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
 * A layer that declares no scale limit draws everywhere, which leaves no zoom
 * for an outline to cover. MapLibre draws nothing for a layer whose maxzoom is
 * its minzoom, so that case needs no special handling here.
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

// Layers map-api hosts itself, drawn from vector tiles

/**
 * A catalogue layer is a picture openmaps has already drawn; one of these is
 * geometry we draw ourselves, from a style translated out of the ArcGIS layer
 * file that came with the data. That is the whole difference, and it is why
 * these carry a paint expression while the WMS pair above carry only opacity.
 */
const localSourceId = (layerId: string) =>
  `${WIDGET_ID_PREFIX}local-src-${layerId}`;
/**
 * One drawn layer's id. Suffixed with the spec's own id because a hosted layer
 * is several MapLibre layers: a translucent polygon is a fill under a line, and
 * points are a circle beside both.
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
 * `layers` is in draw order: the first is at the bottom. That ordering is the
 * server's to decide, because it follows from the symbology - a fill belongs
 * under its own outline - and the client only has to preserve it.
 */
export interface LocalLayerStyle {
  source: {
    minZoom: number | null;
    maxZoom: number;
  };
  layers: LocalLayerSpec[];
}

/**
 * The basemap's lowest symbol layer, or undefined if it has none.
 *
 * Hosted layers are inserted before it so place names and labels stay legible
 * on top of a translucent fill rather than under it.
 */
const firstSymbolLayerId = (map: MapLibreMap): string | undefined =>
  map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;

/**
 * Draw a layer we host, or reveal it if it is already on the map.
 *
 * The source is gated at the style's own floor as well as the layer, so no
 * tile is ever requested for a zoom the layer would not draw at - the server
 * builds one per request, unlike openmaps which is serving a cache.
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

    // Read once rather than per layer: adding a layer before it does not move
    // it, so every spec in this style goes to the same place, and they keep
    // their order among themselves.
    const before = firstSymbolLayerId(map);

    style.layers.forEach((spec) => {
      const drawn = localDrawnId(layerId, spec.id);

      if (map.getLayer(drawn)) {
        map.setLayoutProperty(drawn, "visibility", "visible");
        return;
      }

      // A layer's own floor where it sets one, the source's otherwise. Gating
      // both is deliberate: the source floor stops the tile being fetched and
      // the layer floor stops it being drawn, and a layer that wants to start
      // deeper than the source - a label, a point at close range - says so
      // without the source having to move.
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
 * Take a hosted layer off the map, keeping its parsed tiles.
 *
 * Hidden rather than removed, like the WMS pair above: turning it back on then
 * costs nothing, and the tiles already in the source survive a basemap switch.
 *
 * Found by id prefix rather than from the style that drew them, so this works
 * without the caller holding the style - and cannot leave one layer of a set
 * behind if the style it is called with has since changed.
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

// Which layers the current zoom cannot draw

/** A visible layer and the zoom below which openmaps will not draw it. */
export interface LayerFloor {
  id: string;
  floor: number;
}

/**
 * Which of `floors` the given zoom is too far out to draw.
 *
 * Returns `current` itself, not an equal copy, when the answer has not changed.
 * That identity is the whole point: MapLibre's `zoom` event fires on every
 * frame of a gesture, but which layers sit below their floor changes only when
 * the zoom crosses one - a few times in a full sweep rather than sixty times a
 * second. The result is held in state and read through context by every row in
 * the panel, so a fresh Set per frame would be a fresh context value per frame,
 * and a re-render of every row with it.
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
