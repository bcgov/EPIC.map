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
export const FIT_PADDING = 24;

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
