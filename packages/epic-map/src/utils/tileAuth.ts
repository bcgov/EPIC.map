import type { RequestParameters } from "maplibre-gl";

/**
 * Authorizing the requests MapLibre makes for itself.
 *
 * Everything else goes through axios, which attaches the host's token. Tiles do
 * not: the renderer fetches them itself, so map-api would refuse them all.
 *
 * MapLibre's one hook sees every request the map makes, including the basemap
 * style, its sprites and its glyphs - and the basemap is host-supplied and can
 * name any origin. So deciding which requests are ours is a security control,
 * not an optimisation, which is why it is a function of its own with tests.
 */

/**
 * Build the `transformRequest` MapLibre is constructed with.
 *
 * Answers synchronously for anything that is not ours, so a third-party URL
 * never reaches `getAccessToken`. Keep the result stable: MapLibre reads this
 * once, at construction, so a new one rebuilds the map.
 */
export const createTileRequestAuthorizer = (
  apiBaseUrl: string,
  getAccessToken: () => Promise<string>,
) => {
  // Compared as a prefix: a trailing slash would make every real URL fail the
  // test and go out unauthenticated.
  const base = apiBaseUrl.replace(/\/$/, "");

  return (
    url: string,
  ): RequestParameters | Promise<RequestParameters> | undefined => {
    // `undefined` tells MapLibre to send the request exactly as it intended.
    if (!isApiRequest(base, url)) return undefined;

    return (async () => {
      try {
        const token = await getAccessToken();
        // map-api refuses it, which is what the rest of the widget gets when
        // the host has no token.
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
 * of `https://map-api.example.com.attacker.invalid`. Requiring a separator
 * next, or the string to end, is what closes that.
 */
export const isApiRequest = (apiBaseUrl: string, url: string): boolean => {
  if (!apiBaseUrl) return false;
  if (!url.startsWith(apiBaseUrl)) return false;

  const rest = url.slice(apiBaseUrl.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith("?");
};
