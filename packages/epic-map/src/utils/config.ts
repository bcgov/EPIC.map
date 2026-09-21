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
 * Provisional floor for a catalogue layer, until its real one is known.
 *
 * Every BCGW layer publishes the coarsest scale its style draws at, and past
 * that scale openmaps answers a tile request with a blank image rather than an
 * error. Those limits are nothing alike - across the catalogue they run from
 * 1:50,000 to 1:12,000,000, which is zoom 13 down to zoom 5 - so this is only
 * what a layer is gated on for the moment it takes `useLayerMinZooms` to fetch
 * the published figure, which then replaces it.
 *
 * It sits in the middle of that range deliberately: too low and a layer flashes
 * tiles it cannot draw, too high and one that draws at zoom 5 is held back.
 */
export const WMS_MIN_ZOOM = 8;

/**
 * The zoom a layer is really gated on, from what is known of its floor.
 *
 * Three states, and they do not collapse into one another: a number is the
 * layer's published floor, `null` is a layer that declares no limit and so has
 * none, and `undefined` is one whose floor has not arrived yet - which is what
 * the raster is gated on meanwhile, so it is what the rest of the UI has to
 * agree with or it will contradict the map.
 */
export const effectiveMinZoom = (
  minZoom: number | null | undefined,
): number => (minZoom === null ? MIN_ZOOM : (minZoom ?? WMS_MIN_ZOOM));

/**
 * Upper bound handed to `setLayerZoomRange`, which takes both ends at once.
 *
 * A layer is hidden at zooms at or *above* its maxzoom, so this has to sit
 * above the map's MAX_ZOOM rather than on it - otherwise the layer would
 * disappear exactly when fully zoomed in. 24 is MapLibre's own ceiling.
 */
export const WMS_MAX_LAYER_ZOOM = 24;

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
 * GetCapabilities documents on openmaps.gov.bc.ca are NOT CORS-enabled, so a
 * layer's real minimum zoom cannot be read from the browser; reaching it needs
 * a proxy endpoint on map-api.
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
 * Edge, in pixels, of one WMS tile. Also the source's `tileSize`, which is what
 * keeps the ground each tile covers matched to the pixels asked for.
 *
 * 512 rather than the conventional 256 because openmaps speaks HTTP/1.1, so the
 * browser will hold about six connections to it and everything else queues. A
 * 512px tile covers four 256px tiles at the same resolution, which takes a
 * viewport of one layer from ~30 requests to ~12 - measured at 1.13s against
 * 0.43s, and this widget draws up to MAX_VISIBLE_LAYERS of them at once. The
 * bytes go up slightly; the waiting, which is what is felt, does not.
 */
export const WMS_TILE_SIZE_PX = 512;

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
  `&WIDTH=${WMS_TILE_SIZE_PX}&HEIGHT=${WMS_TILE_SIZE_PX}&SRS=EPSG:3857` +
  "&BBOX={bbox-epsg-3857}";

/**
 * Characters of a dataset description shown in the panel. The panel is 300px
 * wide and the full record is one link away, so a long description costs more
 * scrolling than it repays.
 */
export const CATALOGUE_DESCRIPTION_LIMIT = 220;

/** Layers arrive fully opaque; the opacity slider starts here. */
export const DEFAULT_LAYER_OPACITY = 100;

/**
 * How many layers may draw at once. Each one is a raster source refetching
 * tiles on every pan and zoom, so the panel stops well short of the row limit
 * the API enforces on stored layers.
 */
export const MAX_VISIBLE_LAYERS = 15;

/** Mirrors map-api's folder cap, so the panel can stop at it. map-api enforces it. */
export const MAX_FAVOURITE_FOLDERS = 50;

/**
 * Breathing room, in pixels, left around a layer's features when the map is
 * flown to them. Without it a feature lands hard against the panel and the
 * edges of the widget.
 */
export const FOCUS_PADDING_PX = 48;

/**
 * How far in "Zoom in to view" is willing to go. A single point comes back as a
 * zero-width box, which would otherwise resolve to the maximum zoom and leave
 * the user staring at a rooftop with no context.
 */
export const FOCUS_MAX_ZOOM = 14;

/** Long enough to read as travel rather than a cut, short enough not to wait. */
export const FOCUS_FLY_MS = 800;

/**
 * How long to wait before asking again for a layer's floor that would not come.
 */
export const MIN_ZOOM_RETRY_MS = 30_000;

/**
 * Whether a layer's floor sits past the furthest this map will ever zoom.
 *
 * A published scale converts to a zoom of its own, and a handful of the
 * catalogue's finest layers convert past MAX_ZOOM. Such a layer cannot be
 * reached by zooming, so offering "Zoom in to view" for it is offering a button
 * that cannot do what it says - the map travels as far as it goes and the layer
 * still draws nothing.
 */
export const isBeyondMapZoom = (floor: number): boolean => floor > MAX_ZOOM;

/**
 * Blue for the outline a layer is drawn as while it cannot draw itself.
 *
 * `themeBlue70` of the BC design tokens rather than the theme's primary
 * `#013366`: the outline has to read against satellite imagery as well as
 * against the provincial basemap, and the primary navy disappears into both.
 * A constant rather than a theme lookup because it is spent on a WMS request,
 * outside React's tree.
 */
export const OUTLINE_COLOR = "#5595D9";

/** Thin enough not to swallow a small feature, thick enough to see at z4. */
export const OUTLINE_WIDTH_PX = 2;

/** How big a point is drawn, which has no outline of its own to trace. */
export const OUTLINE_POINT_SIZE_PX = 7;

/**
 * A style that draws the layer as its own shapes, stroked and unfilled, at any
 * zoom at all.
 *
 * The scale limit that stops a layer drawing is published in its *style*, not
 * in the data, so handing openmaps a style of our own is what lifts it - and
 * because it is still the warehouse rendering its own geometry, what comes back
 * is the real shape of the thing rather than a box approximating where it is.
 * Verified against openmaps: a GetMap over the whole province returns a fully
 * transparent tile under the published style and the layer's actual outlines
 * under this one.
 *
 * Two rules rather than one because a PointSymbolizer alongside the others
 * would put a circle on every polygon's centroid as well. `ElseFilter` catches
 * everything the first rule did not, which is every geometry that is not a
 * point - and is shorter than spelling out the negation, which matters in
 * something that has to survive being a query parameter.
 */
const outlineSld = (objectName: string): string => {
  const stroke =
    "<Stroke>" +
    `<CssParameter name="stroke">${OUTLINE_COLOR}</CssParameter>` +
    `<CssParameter name="stroke-width">${OUTLINE_WIDTH_PX}</CssParameter>` +
    "</Stroke>";

  return (
    '<StyledLayerDescriptor xmlns="http://www.opengis.net/sld"' +
    ' xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">' +
    `<NamedLayer><Name>pub:${objectName}</Name>` +
    "<UserStyle><FeatureTypeStyle>" +
    '<Rule><ogc:Filter>' +
    '<ogc:PropertyIsLike wildCard="*" singleChar="." escapeChar="!">' +
    '<ogc:Function name="geometryType"><ogc:Function name="geometry"/>' +
    "</ogc:Function><ogc:Literal>*Point*</ogc:Literal>" +
    "</ogc:PropertyIsLike></ogc:Filter>" +
    "<PointSymbolizer><Graphic><Mark>" +
    `<WellKnownName>circle</WellKnownName>${stroke}</Mark>` +
    `<Size>${OUTLINE_POINT_SIZE_PX}</Size></Graphic></PointSymbolizer></Rule>` +
    "<Rule><ElseFilter/>" +
    `<PolygonSymbolizer>${stroke}</PolygonSymbolizer>` +
    `<LineSymbolizer>${stroke}</LineSymbolizer></Rule>` +
    "</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>"
  );
};

/**
 * WMS tiles of a layer's outline, as a MapLibre raster template.
 *
 * The same request as `wmsTileUrl` with a style attached, so the two sit on the
 * same tile grid and the outline gives way to the layer itself pixel for pixel.
 * Roughly 1.8kB of URL once encoded, which is well inside what a GET carries.
 */
export const outlineTileUrl = (objectName: string): string =>
  `${wmsTileUrl(objectName)}&SLD_BODY=${encodeURIComponent(
    outlineSld(objectName),
  )}`;

/**
 * How long the opacity slider rests before its value is saved. A drag emits a
 * value per pixel of travel; without this each one would be its own PATCH.
 */
export const OPACITY_SAVE_DEBOUNCE_MS = 400;
