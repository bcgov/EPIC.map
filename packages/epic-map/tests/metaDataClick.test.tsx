// @vitest-environment jsdom
//
// Which clicks the identify popup answers, and which it leaves alone.
//
// A dot click is the card's: a small target with nothing of its own to
// identify. A footprint click opens the card too, but is not the card's alone -
// suppressing identify over a whole project boundary made it a dead zone for
// every other layer on the map.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { MeasureProvider, useMeasure } from "@/components/MapTools/MeasureContext";
import {
  SelectAreaProvider,
  useSelectArea,
} from "@/components/MapTools/SelectAreaContext";

/** What is under the pointer, and the map the control reads from its context. */
const under: {
  dot: number | null;
  footprint: number | null;
  map: unknown;
} = { dot: null, footprint: null, map: undefined };

const popup = vi.fn();

vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasProjectAt: () => under.dot !== null,
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
  it("answers a footprint click, so the layers under it still identify", () => {
    under.footprint = 205;
    const map = fakeMap();
    under.map = map;

    render(<MetaDataControl />);
    clickAt(map);

    // Measuring the click box is the control taking the click: the card opens
    // from the same click, and identify runs for whatever else is on.
    expect(map.unproject).toHaveBeenCalled();
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
    // Without this, suppressing every click would pass the dot cases above.
    const map = fakeMap();
    under.map = map;

    render(<MetaDataControl />);
    clickAt(map);

    // No layer is on in this harness, so nothing is drawn - but the control
    // measured the click box, which it only does past the guard.
    expect(map.unproject).toHaveBeenCalled();
  });

  it("measures nothing when a dot owns the click", () => {
    under.dot = 205;
    const map = fakeMap();
    under.map = map;

    render(<MetaDataControl />);
    clickAt(map);

    expect(map.unproject).not.toHaveBeenCalled();
  });
});

describe("while Select area is on", () => {
  /** Stands in for the user turning Select area on. */
  const SelectAreaOn = () => {
    const { tool, toggleTool } = useSelectArea();
    useEffect(() => {
      if (tool === null) toggleTool("select");
    }, [tool, toggleTool]);
    return null;
  };

  it("identifies nothing, footprint or not", () => {
    under.footprint = 205;
    const map = fakeMap();
    under.map = map;

    const view = render(
      <SelectAreaProvider>
        <SelectAreaOn />
        <MetaDataControl />
      </SelectAreaProvider>,
    );
    clickAt(map);

    expect(map.unproject).not.toHaveBeenCalled();
    expect(view.queryByTestId("identify-popup")).toBeNull();
  });
});

describe("while Measure is on", () => {
  /** Turns on Measure; with `done`, finishes a two-point line. */
  const Measuring = ({ done = false }: { done?: boolean }) => {
    const { toggleTool } = useSelectArea();
    const { add, finish } = useMeasure();
    const started = useRef(false);
    useEffect(() => {
      if (started.current) return;
      started.current = true;
      toggleTool("measure");
      if (done) {
        add([0, 0]);
        add([0, 1]);
        finish();
      }
    }, [toggleTool, add, finish, done]);
    return null;
  };

  const renderMeasuring = (done: boolean) =>
    render(
      <SelectAreaProvider>
        <MeasureProvider>
          <Measuring done={done} />
          <MetaDataControl />
        </MeasureProvider>
      </SelectAreaProvider>,
    );

  it("leaves clicks to the points being placed", () => {
    const map = fakeMap();
    under.map = map;

    const view = renderMeasuring(false);
    clickAt(map);

    expect(map.unproject).not.toHaveBeenCalled();
    expect(view.queryByTestId("identify-popup")).toBeNull();
  });

  it("identifies again once the line is done", () => {
    const map = fakeMap();
    under.map = map;

    renderMeasuring(true);
    clickAt(map);

    expect(map.unproject).toHaveBeenCalled();
  });
});
