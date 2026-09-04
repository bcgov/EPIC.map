import { createContext, useContext, type ReactNode } from "react";
import type { AxiosInstance } from "axios";
import type { MapExtent, MapFeature, MapWidgetError } from "@/types";
import type { HostIdentity } from "@/widget/identity";

/**
 * The widget's props after defaults are applied and callbacks are made stable.
 * Moved components read this instead of receiving the same values down a chain
 * of props.
 */
export interface ResolvedMapWidgetConfig {
  projectId?: string;
  initialExtent?: MapExtent;
  /** Always callable — a no-op when the host passed nothing. */
  onFeatureSelect: (feature: MapFeature) => void;
  /** Always callable — a no-op when the host passed nothing. */
  onError: (error: MapWidgetError) => void;
}

export interface MapWidgetContextValue {
  /** Base URL of the EPIC.map API, as given by the host. */
  apiBaseUrl: string;
  /** The widget's axios instance: token attachment and 401 retry are already on it. */
  api: AxiosInstance;
  /**
   * The display claims of the host's signed-in user, or `null` when the token
   * carries none. Resolves the claims and nothing else — this is how a component
   * learns who the user is without the token itself passing through it.
   */
  readHostIdentity: () => Promise<HostIdentity | null>;
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
  <MapWidgetContext.Provider value={value}>{children}</MapWidgetContext.Provider>
);

/**
 * Read the widget's api client and configuration.
 *
 * Note what is deliberately absent: any way to reach a token. Components call
 * `api`, and the instance attaches the host's token for them; `readHostIdentity`
 * hands back claims, never the token they were read from.
 */
export const useMapWidget = (): MapWidgetContextValue => {
  const context = useContext(MapWidgetContext);
  if (!context) {
    throw new Error("useMapWidget must be used inside <MapWidget />");
  }
  return context;
};
