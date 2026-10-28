// @vitest-environment jsdom
//
// What the hook asks of the map, which every other test around search mocks
// away. The camera offset that keeps a searched project clear of its panel is
// one argument handed to MapLibre here, and the components above only ever see
// their own mock of `goTo` - so dropping it left the whole suite green.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";

const remove = vi.fn();
const setLngLat = vi.fn();

/** A pin, reduced to the calls the hook makes on one. */
const marker = { setLngLat, addTo: vi.fn(), remove };

vi.mock("maplibre-gl", () => ({
  Marker: class {
    setLngLat = marker.setLngLat.mockReturnValue(marker);
    addTo = marker.addTo.mockReturnValue(marker);
    remove = marker.remove;
  },
}));

const { useSearchMarker } = await import("@/components/Search/useSearchMarker");

/** Enough of a map to be flown. */
const stubMap = () => ({ flyTo: vi.fn() });

const render = (map: ReturnType<typeof stubMap>) =>
  renderHook(() => useSearchMarker(map as unknown as MapLibreMap, "#123456"))
    .result;

describe("going to a project", () => {
  // The panel docks over the right edge, so the camera is told to land the
  // project beside it rather than under it.
  it("passes the offset it is given through to the map", () => {
    const map = stubMap();
    const { current } = render(map);

    current.goTo([-122, 53], 11, [-180, 0]);

    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-122, 53],
        zoom: 11,
        offset: [-180, 0],
      }),
    );
  });

  // Nothing is covering the map, so the project belongs in the middle of it.
  it("leaves the offset out when it is given none", () => {
    const map = stubMap();
    const { current } = render(map);

    current.goTo([-122, 53], 11);

    // Read off the call rather than matched on the key: an absent `offset` and
    // an `offset` of undefined are the same instruction to MapLibre.
    expect(map.flyTo.mock.calls[0][0].offset).toBeUndefined();
  });
});

describe("going to a place", () => {
  // A place is drawn by no layer, so the pin is the only thing marking it. The
  // camera is centred: nothing opens over the map for a place.
  it("pins it and flies there without an offset", () => {
    const map = stubMap();
    const { current } = render(map);

    current.showAt([-124.7, 48.7], 14);

    expect(marker.setLngLat).toHaveBeenCalledWith([-124.7, 48.7]);
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-124.7, 48.7], zoom: 14 }),
    );
    expect(map.flyTo.mock.calls[0][0].offset).toBeUndefined();
  });
});
