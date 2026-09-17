import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  MIN_ZOOM,
  WIDGET_ID_PREFIX,
  WMS_MAX_LAYER_ZOOM,
  WMS_MIN_ZOOM,
  WMS_TILE_SIZE_PX,
  wmsTileUrl,
} from "@/utils/config";

/**
 * Source and layer ids carry the widget's prefix so that MapSurface's
 * `carryWidgetLayers` transform keeps them across a basemap switch.
 */
const sourceId = (layerId: string) => `${WIDGET_ID_PREFIX}wms-src-${layerId}`;
const rasterId = (layerId: string) => `${WIDGET_ID_PREFIX}wms-${layerId}`;

/** MapLibre paints raster opacity as 0-1; the panel speaks percent. */
const toRasterOpacity = (percent: number) => percent / 100;

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
    const source = sourceId(layer.id);
    const raster = rasterId(layer.id);

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
    const raster = rasterId(layerId);
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
    const raster = rasterId(layerId);
    if (map.getLayer(raster)) {
      map.setPaintProperty(raster, "raster-opacity", toRasterOpacity(opacity));
    }
  });
};

export const hideWmsLayer = (map: MapLibreMap, layerId: string) => {
  whenStyleReady(map, () => {
    const raster = rasterId(layerId);
    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "none");
    }
  });
};
