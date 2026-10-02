import type { RequestParameters } from "maplibre-gl";

/**
 * Authorizing the requests MapLibre makes for itself.
 *
 * Everything the widget asks for goes through axios, which attaches the host's
 * token on the way out. Tiles do not: the renderer fetches them itself, on its
 * own schedule, so map-api would refuse every one of them without this.
 *
 * MapLibre offers one hook for that, and it sees *every* request the map makes
 * - the basemap style document, its sprite sheet, its glyph ranges, and the
 * tiles of whatever raster layers are on. The basemap is supplied by the host
 * and can name any origin, so attaching the token to everything would hand a
 * user's IDIR credentials to a third party. Deciding which requests are ours is
 * therefore a security control rather than an optimisation, which is why it
 * lives in a function of its own with tests on it.
 */

/**
 * Build the `transformRequest` MapLibre is constructed with.
 *
 * The returned function answers synchronously for anything that is not ours,
 * so a third-party URL never reaches `getAccessToken` at all; only a map-api
 * URL returns a promise and waits for a token.
 *
 * Keep the result stable. MapLibre reads `transformRequest` once, when the map
 * is constructed, so handing it a new one means rebuilding the map.
 */
export const createTileRequestAuthorizer = (
  apiBaseUrl: string,
  getAccessToken: () => Promise<string>,
) => {
  // Compared as a prefix, so a trailing slash would make every real URL fail
  // the test and go out unauthenticated.
  const base = apiBaseUrl.replace(/\/$/, "");

  return (
    url: string,
  ): RequestParameters | Promise<RequestParameters> | undefined => {
    // `undefined` tells MapLibre to send the request exactly as it intended.
    if (!isApiRequest(base, url)) return undefined;

    return (async () => {
      try {
        const token = await getAccessToken();
        // An unauthenticated request is refused by map-api, which is the same
        // answer the rest of the widget gets when the host has no token.
        return token
          ? { url, headers: { Authorization: `Bearer ${token}` } }
          : { url };
      } catch {
        return { url };
      }
    })();
  };
};

/**
 * Whether `url` addresses map-api and may therefore carry the user's token.
 *
 * A prefix test alone is not enough: `https://map-api.example.com` is a prefix
 * of `https://map-api.example.com.attacker.invalid`, which is a different
 * origin entirely. Requiring the next character to be a path separator, or the
 * string to end there, is what closes that.
 */
export const isApiRequest = (apiBaseUrl: string, url: string): boolean => {
  if (!apiBaseUrl) return false;
  if (!url.startsWith(apiBaseUrl)) return false;

  const rest = url.slice(apiBaseUrl.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith("?");
};
