// @vitest-environment jsdom
//
// Which clicks the identify popup answers, and which it leaves alone.
//
// A click that opens a project card must not also open a popup beside it. The
// dot was handled; the footprint was not, so once a boundary click started
// opening the card, a click inside one gave both whenever any other layer was
// on - which is what the suppression exists to prevent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/** What is under the pointer, and the map the control reads from its context. */
const under: {
  dot: number | null;
  footprint: number | null;
  map: unknown;
} = { dot: null, footprint: null, map: undefined };

const popup = vi.fn();

vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  projectIdAt: () => under.dot,
}));

vi.mock("@/components/Layers/eaoVisibility", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  footprintTrackIdAt: () => under.footprint,
}));

// The popup's own contents are its own test; this is about whether it opens.
vi.mock("@/components/MetaData/MetaDataPopup", () => ({
  default: (props: Record<string, unknown>) => {
    popup(props);
    return <div data-testid="identify-popup" />;
  },
}));

vi.mock("@/components/Layers/LayersContext", () => ({
  useLayers: () => ({
    map: under.map,
    visibleIds: new Set<string>(),
    appliedLayers: [{ id: 'applied-1', objectName: 'WHSE_TEST.A_LAYER' }],
    favourites: [],
    opacities: {},
  }),
}));

vi.mock("@/components/Layers/UserLayers/ImportedLayersContext", () => ({
  // The control renames these on destructure; these are the context's names.
  useImportedLayersContext: () => ({
    layers: [],
    shownIds: new Set<string>(),
  }),
}));

vi.mock("@/api/useMetaData", () => ({ useMetaData: () => ({ data: undefined }) }));
vi.mock("@/api/useLocalLayerFeatures", () => ({
  useLocalLayerFeatures: () => ({ data: undefined }),
  localFeatureRef: () => "ref",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
}));

const { default: MetaDataControl } = await import(
  "@/components/MetaData/MetaDataControl"
);

const fakeMap = () => ({
  on: vi.fn(),
  off: vi.fn(),
  getStyle: () => ({ layers: [] }),
  getLayer: () => undefined,
  queryRenderedFeatures: () => [],
  getCanvas: () => ({ style: {} }),
  getContainer: () => ({ clientWidth: 1200, clientHeight: 800 }),
  project: () => ({ x: 0, y: 0 }),
  // clickBox calls this, and only past the suppression guard - so it is how a
  // test tells "the control took the click" from "it let the click go".
  unproject: vi.fn(() => ({ lng: 0, lat: 0 })),
});

/** Fire the click handler the control registered on the map. */
const clickAt = (map: ReturnType<typeof fakeMap>) => {
  const handler = map.on.mock.calls.find((call) => call[0] === "click");
  expect(handler).toBeDefined();
  (handler![1] as (event: unknown) => void)({
    point: { x: 10, y: 10 },
    lngLat: { lng: -123, lat: 50 },
  });
};

beforeEach(() => {
  popup.mockClear();
  under.dot = null;
  under.footprint = null;
  under.map = undefined;
});
afterEach(cleanup);

describe("what the identify popup answers", () => {
  it("leaves a footprint click to the project card", () => {
    under.footprint = 205;
    const map = fakeMap();
    under.map = map;

    const view = render(<MetaDataControl />);
    clickAt(map);

    expect(view.queryByTestId("identify-popup")).toBeNull();
  });

  it("leaves a dot click to the project card", () => {
    under.dot = 205;
    const map = fakeMap();
    under.map = map;

    const view = render(<MetaDataControl />);
    clickAt(map);

    expect(view.queryByTestId("identify-popup")).toBeNull();
  });

  it("takes a click on neither, so the suppression is not blanket", () => {
    // Without this, suppressing every click would pass the two above.
    const map = fakeMap();
    under.map = map;

    render(<MetaDataControl />);
    clickAt(map);

    // No layer is on in this harness, so nothing is drawn - but the control
    // measured the click box, which it only does past the guard.
    expect(map.unproject).toHaveBeenCalled();
  });

  it("measures nothing when a footprint owns the click", () => {
    under.footprint = 205;
    const map = fakeMap();
    under.map = map;

    render(<MetaDataControl />);
    clickAt(map);

    expect(map.unproject).not.toHaveBeenCalled();
  });
});
