import type { StyleSpecification } from "maplibre-gl";
import type { MapBasemapStyles, MapExtent } from "@/types";

/**
 * Map configuration: the numbers and URLs the map surface is built from.
 */

/**
 * British Columbia, as `[west, south, east, north]`.
 *
 * The default view, and deliberately an extent rather than a center/zoom pair: a
 * fixed zoom shows a different amount of the province in a full-page host than
 * in a sidebar. Fitting bounds puts the whole province on screen at whatever
 * size the host gives the widget. `initialExtent` overrides it.
 */
export const DEFAULT_EXTENT: MapExtent = [-139.1, 48.2, -114.0, 60.1];

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

/**
 * Prefix for every source and layer this widget adds to a style.
 */
export const WIDGET_ID_PREFIX = "epic-";

export type BasemapId = "standard" | "satellite";

export interface Basemap {
  label: string;
  style: string | StyleSpecification;
  thumbnail: string;
}

/**
 * BC Basemap, the provincial basemap: the "without hillshade" item of the BC
 * Data Catalogue's `bc-basemap` dataset. A public ArcGIS Online vector tile
 * service in EPSG:3857, published as a Style Spec v8 document with absolute
 * source, sprite and glyph URLs. No API key. Carries BC Sans and the Aboriginal
 * Sans/Serif faces, so provincial typography and Indigenous place names render
 * as the province publishes them.
 *
 * Licensed "Access Only" - B.C. Crown copyright, consumed live. Do not mirror,
 * proxy or cache the tiles. Attribution is declared in the style itself.
 *
 * The catalogue warns these URLs will change, with the old ones kept for three
 * months. `basemapStyles` is the way out: a host can pass the new URL without
 * waiting for a release of this package.
 */
const BC_BASEMAP_ITEM = "b1624fea73bd46c681fab55be53d96ae";
const BC_BASEMAP_STYLE = `https://www.arcgis.com/sharing/rest/content/items/${BC_BASEMAP_ITEM}/resources/styles/root.json`;
/** The item's own preview image: a real BC Basemap render, not a stand-in. */
const BC_BASEMAP_THUMBNAIL = `https://www.arcgis.com/sharing/rest/content/items/${BC_BASEMAP_ITEM}/info/thumbnail/ago_downloaded.png`;

const ESRI_WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** z8/84/39 — a single imagery tile over central BC. */
const ESRI_IMAGERY_THUMBNAIL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/84/39";

export const BASEMAPS: Record<BasemapId, Basemap> = {
  standard: {
    label: "Standard",
    style: BC_BASEMAP_STYLE,
    thumbnail: BC_BASEMAP_THUMBNAIL,
  },
  satellite: {
    label: "Satellite",
    style: {
      version: 8,
      sources: {
        "esri-world-imagery": {
          type: "raster",
          tiles: [ESRI_WORLD_IMAGERY],
          tileSize: 256,
          maxzoom: 19,
          attribution: "© Esri, Maxar, Earthstar Geographics",
        },
      },
      layers: [
        {
          id: "esri-world-imagery",
          type: "raster",
          source: "esri-world-imagery",
        },
      ],
    },
    thumbnail: ESRI_IMAGERY_THUMBNAIL,
  },
};

export const DEFAULT_BASEMAP: BasemapId = "standard";

export const otherBasemap = (current: BasemapId): BasemapId =>
  current === "standard" ? "satellite" : "standard";

/**
 * A basemap with the host's style substituted, when the host supplied one.
 *
 * Only the style is a host's to replace: the label and thumbnail describe the
 * slot, not the particular service filling it. Returns the original object when
 * there is no override, so callers can compare styles by identity.
 */
export const resolveBasemap = (
  id: BasemapId,
  overrides?: MapBasemapStyles,
): Basemap => {
  const basemap = BASEMAPS[id];
  const style = overrides?.[id];
  return style ? { ...basemap, style } : basemap;
};

/**
 * BC Data Catalogue — the CKAN instance behind catalogue.data.gov.bc.ca.
 *
 * Searched straight from the browser: the endpoint sends
 * `access-control-allow-origin: *` and takes no credentials, so routing it
 * through map-api would add a hop and buy nothing. Note that the WMS
 * GetCapabilities documents on openmaps.gov.bc.ca are NOT CORS-enabled - see
 * `ZoomToViewButton` for what that costs us.
 */
export const CATALOGUE_SEARCH_URL =
  "https://catalogue.data.gov.bc.ca/api/3/action/package_search";

export const CATALOGUE_DATASET_URL = "https://catalogue.data.gov.bc.ca/dataset";

/** Matching the prototype: enough to fill the panel, few enough to stay fast. */
export const CATALOGUE_SEARCH_ROWS = 15;

/**
 * Two characters before anything is fetched: shorter prefixes match most of the
 * catalogue, so the request costs a round trip to say nothing useful.
 */
export const MIN_CATALOGUE_QUERY_LENGTH = 2;

/** Long enough to skip the keystrokes in the middle of a typed word. */
export const CATALOGUE_SEARCH_DEBOUNCE_MS = 400;

/**
 * WMS tiles for a BCGW object, as a MapLibre raster template.
 *
 * EPSG:3857 with a `{bbox-epsg-3857}` placeholder is what MapLibre substitutes
 * per tile; WMS 1.1.1 is used because it takes `SRS`, which openmaps honours.
 */
export const wmsTileUrl = (objectName: string): string =>
  `https://openmaps.gov.bc.ca/geo/pub/${objectName}/ows?` +
  "SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1" +
  `&LAYERS=pub:${objectName}` +
  "&FORMAT=image/png&TRANSPARENT=TRUE" +
  "&WIDTH=256&HEIGHT=256&SRS=EPSG:3857" +
  "&BBOX={bbox-epsg-3857}";
