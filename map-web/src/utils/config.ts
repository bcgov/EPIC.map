declare global {
  interface Window {
    _env_: {
      VITE_API_URL: string;
      VITE_ENV: string;
      VITE_VERSION: string;
      VITE_APP_TITLE: string;
      VITE_APP_URL: string;
      VITE_OIDC_AUTHORITY: string;
      VITE_CLIENT_ID: string;
      VITE_MAP_WIDGET_URL: string;
    };
  }
}
const API_URL =
  window._env_?.VITE_API_URL || import.meta.env.VITE_API_URL || "";
const APP_ENVIRONMENT =
  window._env_?.VITE_ENV || import.meta.env.VITE_ENV || "";
const APP_VERSION =
  window._env_?.VITE_VERSION || import.meta.env.VITE_VERSION || "";
const APP_TITLE =
  window._env_?.VITE_APP_TITLE || import.meta.env.VITE_APP_TITLE || "EPIC.map";
const APP_URL = window._env_?.VITE_APP_URL || import.meta.env.VITE_APP_URL;
const OIDC_AUTHORITY = window._env_?.VITE_OIDC_AUTHORITY || import.meta.env.VITE_OIDC_AUTHORITY;
const CLIENT_ID = window._env_?.VITE_CLIENT_ID || import.meta.env.VITE_CLIENT_ID;

/**
 * Origin serving the EPIC map's Module Federation remote, without a trailing
 * path — `remoteEntry.js` hangs off it.
 *
 * The map is not bundled into this application; it is fetched at runtime from
 * its own deployment, which is why this is a runtime value rather than something
 * baked in at build time. The same image therefore runs in dev, test and prod
 * against three different widget origins, which is what makes the promotion in
 * .github/workflows/deploy.yml ship the bytes that were tested.
 *
 * Unset, it falls back to the widget's local dev server — `npm run dev` at the
 * repository root starts it on 5174.
 */
const MAP_WIDGET_URL =
  window._env_?.VITE_MAP_WIDGET_URL ||
  import.meta.env.VITE_MAP_WIDGET_URL ||
  "http://127.0.0.1:5174";

// The ops endpoints (healthz/readyz) sit outside the /api blueprint,
// so they hang off the service root rather than the API url.
const OPS_URL = `${API_URL.replace(/\/api\/?$/, "")}/ops`;

export const AppConfig = {
  apiUrl: `${API_URL}`,
  opsUrl: OPS_URL,
  environment: APP_ENVIRONMENT,
  version: APP_VERSION,
  appTitle: APP_TITLE,
  /** Entry point of the federated map remote. */
  mapWidgetEntry: `${MAP_WIDGET_URL.replace(/\/$/, "")}/remoteEntry.js`,
};

export const OidcConfig = {
  authority: OIDC_AUTHORITY,
  client_id: CLIENT_ID,
  redirect_uri: `${APP_URL}/oidc-callback`,
  post_logout_redirect_uri: `${APP_URL}/`,
  scope: "openid profile email",
  response_type: "code",
  // Renewal is driven explicitly from the accessTokenExpiring event in
  // router.tsx, so that a failure to renew can be turned into a visible
  // "session expired" screen rather than a silent 401 on the next request.
  automaticSilentRenew: false,
  revokeTokensOnSignout: true,
  // Skip Keycloak's identity provider chooser and go straight to IDIR. EPIC.map
  // is a staff application; there is no second provider to choose.
  extraQueryParams: {
    kc_idp_hint: "idir",
  },
};

/** Where to send the user after sign in, remembered across the IDIR redirect. */
export const REDIRECT_URL_STORAGE_KEY = "redirectUrl";
