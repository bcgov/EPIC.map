import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { WIDGET_ID_PREFIX, wmsTileUrl } from "@/utils/config";

/**
 * Source and layer ids carry the widget's prefix so that MapSurface's
 * `carryWidgetLayers` transform keeps them across a basemap switch.
 */
const sourceId = (layerId: string) => `${WIDGET_ID_PREFIX}wms-src-${layerId}`;
const rasterId = (layerId: string) => `${WIDGET_ID_PREFIX}wms-${layerId}`;

/** Runs `work` once the style is ready to accept sources and layers. */
const whenStyleReady = (map: MapLibreMap, work: () => void) => {
  if (map.isStyleLoaded()) {
    work();
    return;
  }
  map.once("load", work);
};

/**
 * Draw a catalogue layer, or reveal it if it is already on the map.
 */
export const showWmsLayer = (map: MapLibreMap, layer: CatalogueLayer) => {
  if (!layer.wmsObjectName) return;

  whenStyleReady(map, () => {
    const source = sourceId(layer.id);
    const raster = rasterId(layer.id);

    if (map.getLayer(raster)) {
      map.setLayoutProperty(raster, "visibility", "visible");
      return;
    }

    if (!map.getSource(source)) {
      map.addSource(source, {
        type: "raster",
        tiles: [wmsTileUrl(layer.wmsObjectName as string)],
        tileSize: 256,
      });
    }

    map.addLayer({ id: raster, type: "raster", source });
  });
};

export const hideWmsLayer = (map: MapLibreMap, layerId: string) => {
  const raster = rasterId(layerId);
  if (map.getLayer(raster)) {
    map.setLayoutProperty(raster, "visibility", "none");
  }
};
