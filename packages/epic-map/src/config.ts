import type { StyleSpecification } from "maplibre-gl";
import type { MapExtent } from "@/types";

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

const ESRI_WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** z8/84/39 — central BC, in both services. */
const ESRI_IMAGERY_THUMBNAIL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/84/39";
const ESRI_LIGHT_GRAY_THUMBNAIL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/8/84/39";

export const BASEMAPS: Record<BasemapId, Basemap> = {
  /**
   * TODO: replace with the approved BC Gov basemap tile service when there is
   * one. If a host ever needs to choose, that belongs in `MapWidgetProps`.
   */
  standard: {
    label: "Standard",
    style: "https://tiles.openfreemap.org/styles/positron",
    thumbnail: ESRI_LIGHT_GRAY_THUMBNAIL,
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
