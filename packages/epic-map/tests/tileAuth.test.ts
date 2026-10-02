import { describe, expect, it, vi } from "vitest";
import { createTileRequestAuthorizer, isApiRequest } from "@/utils/tileAuth";

const API_BASE = "https://map-api.example.invalid/api";
const TILE_URL = `${API_BASE}/local/layers/WHSE_X.Y/tiles/9/74/165`;

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
    // The case a bare startsWith would let through, and the reason this is a
    // function rather than one line at the call site.
    expect(
      isApiRequest(API_BASE, "https://map-api.example.invalid.attacker.test/x"),
    ).toBe(false);
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
