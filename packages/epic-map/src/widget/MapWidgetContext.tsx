import { createContext, useContext, type ReactNode } from "react";
import type { AxiosInstance } from "axios";
import type { RequestParameters } from "maplibre-gl";
import type {
  MapBasemapStyles,
  MapExtent,
  MapFeature,
  MapWidgetError,
} from "@/types";
import type { HostIdentity } from "@/utils/identity";

/**
 * The widget's props after defaults are applied and callbacks are made stable.
 * Moved components read this instead of receiving the same values down a chain
 * of props.
 */
export interface ResolvedMapWidgetConfig {
  projectId?: string;
  initialExtent?: MapExtent;
  basemapStyles?: MapBasemapStyles;
  /** Always callable — a no-op when the host passed nothing. */
  onFeatureSelect: (feature: MapFeature) => void;
  /** Always callable — a no-op when the host passed nothing. */
  onError: (error: MapWidgetError) => void;
}

export interface MapWidgetContextValue {
  /** Base URL of the EPIC.map API, as given by the host. */
  apiBaseUrl: string;
  /**
   * This widget instance, for the life of the mount. Nothing identifying — it
   * only tells one map's requests from another's, so map-api can drop work for
   * a click this map has already replaced.
   */
  clientId: string;
  /** The widget's axios instance: token attachment and 401 retry are already on it. */
  api: AxiosInstance;
  publicApi: AxiosInstance;
  /**
   * The display claims of the host's signed-in user, or `null` when the token
   * carries none. Resolves the claims and nothing else — this is how a component
   * learns who the user is without the token itself passing through it.
   */
  readHostIdentity: () => Promise<HostIdentity | null>;
  /**
   * Authorize one request MapLibre will make on its own.
   *
   * The renderer fetches tiles itself, so they never pass through the axios
   * instance and never pick up its Authorization header. This resolves the
   * header for a map-api URL and `undefined` for anything else — which is a
   * security control, not tidiness: MapLibre also fetches the basemap style,
   * its sprites and its glyphs, and the basemap is host-supplied, so attaching
   * the header unconditionally would send the user's token to a third party.
   *
   * Must be referentially stable. MapLibre reads `transformRequest` once, when
   * the map is constructed, so a new identity each render rebuilds the map.
   */
  authorizeTileRequest: (
    url: string,
  ) => RequestParameters | Promise<RequestParameters> | undefined;
  config: ResolvedMapWidgetConfig;
}

/**
 * Internal. Not exported from the package — hosts configure the widget with props,
 * and this is how those props reach the components inside it.
 */
const MapWidgetContext = createContext<MapWidgetContextValue | null>(null);

export const MapWidgetProvider = ({
  value,
  children,
}: {
  value: MapWidgetContextValue;
  children: ReactNode;
}) => (
  <MapWidgetContext.Provider value={value}>
    {children}
  </MapWidgetContext.Provider>
);

/**
 * Read the widget's api client and configuration.
 */
export const useMapWidget = (): MapWidgetContextValue => {
  const context = useContext(MapWidgetContext);
  if (!context) {
    throw new Error("useMapWidget must be used inside <MapWidget />");
  }
  return context;
};
