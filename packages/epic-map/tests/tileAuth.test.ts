import { describe, expect, it, vi } from "vitest";
import { createTileRequestAuthorizer, isApiRequest } from "@/utils/tileAuth";

const API_BASE = "https://map-api.example.invalid/api";
const TILE_URL = `${API_BASE}/local/layers/WHSE_X.Y/tiles/9/74/165`;

// A host may pass an origin with no path at all, and that is the shape where
// the separator check is the only thing standing between the user's token and
// a lookalike origin: with a path on the base, a hostname that extends it
// fails the prefix test first and never reaches the check. Tests that only use
// API_BASE therefore pass whether the check is there or not.
const API_BASE_NO_PATH = "https://map-api.example.invalid";

const authorizer = (token = "a-token") =>
  createTileRequestAuthorizer(API_BASE, () => Promise.resolve(token));

describe("isApiRequest", () => {
  it("accepts a url under the api base", () => {
    expect(isApiRequest(API_BASE, TILE_URL)).toBe(true);
  });

  it("accepts the base url itself", () => {
    expect(isApiRequest(API_BASE, API_BASE)).toBe(true);
  });

  it("rejects an origin that merely starts with the base url", () => {
    // Rejected by the prefix test, because the base carries a path this does
    // not share. Kept for the shape itself; the next two are what hold the
    // separator check in place.
    expect(
      isApiRequest(API_BASE, "https://map-api.example.invalid.attacker.test/x"),
    ).toBe(false);
  });

  it("rejects a hostname that extends a path-less base url", () => {
    // The case a bare startsWith lets through, and the reason this is a
    // function rather than one line at the call site. The attacker's host has
    // the base as a genuine prefix, so only the separator check refuses it -
    // and sending the user's IDIR token here is the failure being prevented.
    expect(
      isApiRequest(
        API_BASE_NO_PATH,
        "https://map-api.example.invalid.attacker.test/x",
      ),
    ).toBe(false);
  });

  it("rejects a path that merely extends the base's last segment", () => {
    // `/apifoo` has `/api` as a prefix without being under it. Same control,
    // reached the same way, on a base that does carry a path.
    expect(
      isApiRequest(API_BASE, "https://map-api.example.invalid/apifoo/tiles"),
    ).toBe(false);
  });

  it("accepts a url whose path ends at the base, with a query", () => {
    // The `?` arm of the separator check: nothing else in this file reaches it.
    expect(isApiRequest(API_BASE, `${API_BASE}?v=2`)).toBe(true);
  });

  it("rejects a third-party url", () => {
    expect(isApiRequest(API_BASE, "https://tiles.arcgis.com/tile/1/2/3")).toBe(
      false,
    );
  });

  it("rejects everything when there is no base url to compare against", () => {
    expect(isApiRequest("", "https://anything.invalid")).toBe(false);
  });
});

describe("createTileRequestAuthorizer", () => {
  it("attaches a bearer token to a map-api request", async () => {
    const result = await authorizer()(TILE_URL);

    expect(result).toEqual({
      url: TILE_URL,
      headers: { Authorization: "Bearer a-token" },
    });
  });

  it("leaves a third-party request alone", () => {
    // Synchronously undefined, which is how MapLibre is told to send the
    // request exactly as it intended.
    expect(authorizer()("https://tiles.arcgis.com/tile/1/2/3")).toBeUndefined();
  });

  it("never reads the token for a third-party request", () => {
    // The control that matters. The basemap is host-supplied and can name any
    // origin, so its requests must not reach getAccessToken at all - not merely
    // go out unsigned.
    const getAccessToken = vi.fn(() => Promise.resolve("a-token"));
    const authorize = createTileRequestAuthorizer(API_BASE, getAccessToken);

    authorize("https://basemaps.arcgis.com/style.json");
    authorize("https://basemaps.arcgis.com/sprite.png");
    authorize("https://fonts.example.invalid/glyphs/0-255.pbf");

    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("tolerates a trailing slash on the base url", () => {
    const authorize = createTileRequestAuthorizer(`${API_BASE}/`, () =>
      Promise.resolve("a-token"),
    );

    expect(authorize(TILE_URL)).toBeDefined();
  });

  it("sends the request unsigned when the host has no token", async () => {
    const result = await authorizer("")(TILE_URL);

    expect(result).toEqual({ url: TILE_URL });
  });

  it("sends the request unsigned when the host throws", async () => {
    const authorize = createTileRequestAuthorizer(API_BASE, () =>
      Promise.reject(new Error("no session")),
    );

    await expect(authorize(TILE_URL)).resolves.toEqual({ url: TILE_URL });
  });
});
