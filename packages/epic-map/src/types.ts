import type { Geometry } from "geojson";

/** A feature the user selected on the map. */
export interface MapFeature {
  /** Stable identifier for the feature, as returned by the API. */
  id: string;
  /** Identifier of the map layer the feature came from. */
  layerId?: string;
  /** GeoJSON geometry in WGS84 (EPSG:4326). */
  geometry: Geometry;
  /** Feature attributes, passed through from the API unmodified. */
  properties: Record<string, unknown>;
}

/**
 * Coarse classification of a failure, so a host can decide what to do without
 * unwrapping an axios error. `auth` means the host's session could not produce a
 * token the API would accept — the host owns the session, so the host decides
 * whether that means a re-login prompt.
 */
export type MapWidgetErrorKind =
  | "auth"
  | "network"
  | "request"
  | "server"
  | "unknown";

/** An error surfaced to the host through `onError`. */
export interface MapWidgetError {
  kind: MapWidgetErrorKind;
  /** Human-readable summary. Not intended for display to end users as-is. */
  message: string;
  /** HTTP status, when the failure came from a response. */
  status?: number;
  /** The underlying error, for logging. Shape is not part of the contract. */
  cause?: unknown;
}

/**
 * Bounding box as `[west, south, east, north]` in WGS84 (EPSG:4326) degrees.
 */
export type MapExtent = [number, number, number, number];

export interface MapWidgetProps {
  /** Base URL of the EPIC.map API, including the `/api` prefix. */
  apiBaseUrl: string;

  /**
   * Supplies a bearer token for API calls.
   *
   * This is the ONLY way a token enters the widget. The widget never reads
   * `sessionStorage`, `localStorage` or cookies, and never constructs a Keycloak
   * or OIDC client — the host already has a session and the widget borrows the
   * token from it.
   *
   * Called before every request, and once more if a request comes back 401, so
   * an implementation that refreshes on demand works without extra wiring. It
   * may reject; the failure is reported through `onError` as `kind: "auth"`.
   */
  getAccessToken: () => Promise<string>;

  /** Restrict the map to a single project. */
  projectId?: string;

  /** Initial viewport, as `[west, south, east, north]`. */
  initialExtent?: MapExtent;

  /**
   * Height of the widget's root element. A number is treated as pixels; a string
   * is used verbatim. Defaults to `"100%"`, which fills the host's container —
   * prefer sizing the container over passing a fixed height.
   */
  height?: string | number;

  /** Called when the user selects a feature. */
  onFeatureSelect?: (feature: MapFeature) => void;

  /**
   * Called when the widget fails. The widget never redirects and never renders a
   * full-page error — a host tab keeps its state, and the host decides what the
   * user sees.
   */
  onError?: (error: MapWidgetError) => void;
}
