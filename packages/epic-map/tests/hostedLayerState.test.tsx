// @vitest-environment jsdom
//
// Where a hosted layer's on/off state lives.
//
// Session state, deliberately. But "session" has to mean the map's, not the
// Layers panel's: the panel renders its sections behind `{open && ...}`, so
// held in a section the toggle reset itself and the layer disappeared on
// reopen - after staying drawn while the panel was shut.
//
// `visibleIds` is provider state and HostedLayer is mounted by the provider,
// which is what keeps the property. This renders the real provider and
// unmounts a consumer the way closing the panel unmounts a section.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const showLocalVectorLayer = vi.fn();
const hideLocalVectorLayer = vi.fn();

// Mocked to their empty states: this file is about one piece of state, and
// each of these would otherwise want a server.
vi.mock("@/api/useAppliedLayers", () => ({
  useAppliedLayers: () => ({
    layers: [],
    isPending: false,
    error: null,
    pendingIds: new Set(),
    retry: vi.fn(),
    applyLayer: vi.fn(),
    removeLayer: vi.fn(),
    saveOpacity: vi.fn(),
  }),
}));
vi.mock("@/api/useLayerFocus", () => ({
  useLayerFocus: () => ({
    focusLayer: vi.fn(),
    focusPendingIds: new Set(),
    focusErrors: {},
  }),
}));
vi.mock("@/api/useLayerMinZooms", () => ({
  useLayerMinZooms: () => ({}),
}));
vi.mock("@/api/useFavouriteLayers", () => ({
  useFavouriteLayers: () => ({
    favourites: [],
    isPending: false,
    error: null,
    pendingIds: new Set(),
    retry: vi.fn(),
    addFavourite: vi.fn(),
    removeFavourite: vi.fn(),
    moveFavourite: vi.fn(),
  }),
}));
vi.mock("@/api/useFavouriteFolders", () => ({
  useFavouriteFolders: () => ({
    folders: [],
    isPending: false,
    error: null,
    retry: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    setFolderCollapsed: vi.fn(),
    deleteFolder: vi.fn(),
    saveError: null,
    clearSaveError: vi.fn(),
  }),
}));
vi.mock("@/api/useImportedLayers", () => ({
  useImportedLayers: () => ({
    layers: [],
    isPending: false,
    error: null,
    retry: vi.fn(),
    addLayer: vi.fn(),
    updateLayer: vi.fn(),
    deleteLayer: vi.fn(),
  }),
  useLayerUploads: () => ({
    uploads: [],
    startUpload: vi.fn(),
    cancelUpload: vi.fn(),
    retryUpload: vi.fn(),
    dismissUpload: vi.fn(),
  }),
}));
vi.mock("@/components/Layers/UserLayers/useImportedLayersOnMap", () => ({
  useImportedLayersOnMap: () => ({ failedIds: new Set(), retryFeatures: vi.fn() }),
}));

// One object, handed back by identity, as react-query does for a cached
// value: a fresh literal per render would re-run the draw effect on every
// provider change and mask what the "drawn once" test checks.
vi.mock("@/api/useLocalLayerStyle", () => {
  const style = {
    source: { minZoom: 6, maxZoom: 12 },
    layers: [
      {
        id: "line",
        type: "line",
        sourceLayer: "pip_consultation_areas",
        paint: { "line-color": "#5B2D75" },
      },
    ],
  };
  return {
    useLocalLayerStyle: (objectName: string | null) => ({
      data: objectName ? style : undefined,
    }),
    // The floor the style above carries, keyed as the real hook keys it.
    useLocalLayerFloors: (objectNames: readonly string[]) =>
      Object.fromEntries(objectNames.map((objectName) => [objectName, 6])),
  };
});

vi.mock("@/widget/MapWidgetContext", () => ({
  useMapWidget: () => ({ apiBaseUrl: "https://map-api.example.invalid/api" }),
}));

// Only the two calls this file asserts on; the rest of the module is real.
vi.mock("@/components/Layers/layerUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showLocalVectorLayer: (...args: unknown[]) => showLocalVectorLayer(...args),
  hideLocalVectorLayer: (...args: unknown[]) => hideLocalVectorLayer(...args),
}));

const { LayersProvider, useLayers } = await import(
  "@/components/Layers/LayersContext"
);
const { PIP_OBJECT_NAME, localLayerId } = await import("@/utils/localLayers");

// HostedLayer reads the filter bar. Mocked rather than provided: the real
// provider runs the bar's queries, which these tests are not about.
// One array, not a fresh one per render: the real provider memoises this, and
// a new identity each call would churn the memo and re-run the draw effect.
const NO_PROJECTS: never[] = [];
vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ visibleProjects: NO_PROJECTS }),
}));

const PIP_LAYER_ID = localLayerId(PIP_OBJECT_NAME);

/**
 * A hosted layer's row, reduced to what this file is about: which component
 * owns the on/off state. Drives `toggleVisible` and reads `visibleIds`, the
 * contract the real row uses.
 */
function HostedLayerRow() {
  const { visibleIds, toggleVisible, lineWidths, setLineWidth } = useLayers();
  const on = visibleIds.has(PIP_LAYER_ID);
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        onClick={() =>
          toggleVisible({
            id: PIP_LAYER_ID,
            objectName: PIP_OBJECT_NAME,
          } as never)
        }
      >
        hosted layer
      </button>
      {/* The expanded row's slider, reduced to one move. */}
      <button
        type="button"
        aria-valuenow={lineWidths[PIP_LAYER_ID] ?? null}
        onClick={() => setLineWidth(PIP_LAYER_ID, 1.5)}
      >
        line width
      </button>
    </>
  );
}

/** The row as the DOM holds it, since this package has no jest-dom. */
const toggle = () => screen.getByRole("button", { name: "hosted layer" });
const isOn = () => toggle().getAttribute("aria-pressed") === "true";

const widthSlider = () => screen.getByRole("button", { name: "line width" });
const widthShown = () => widthSlider().getAttribute("aria-valuenow");

/**
 * The panel open or shut, over a provider that stays mounted either way.
 * `open` models LayersControl's `{open && (...)}`.
 */
const renderPanel = (map: object) => {
  const view = render(
    <LayersProvider map={map as never}>
      <HostedLayerRow />
    </LayersProvider>,
  );

  return {
    reopen: (open: boolean) =>
      view.rerender(
        <LayersProvider map={map as never}>
          {open ? <HostedLayerRow /> : null}
        </LayersProvider>,
      ),
  };
};

// Enough of a map for the provider's effects to run against.
const fakeMap = () => ({
  isStyleLoaded: () => true,
  getZoom: () => 9,
  getSource: () => undefined,
  getLayer: () => undefined,
  addSource: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  setLayoutProperty: vi.fn(),
  setPaintProperty: vi.fn(),
  setLayerZoomRange: vi.fn(),
  getStyle: () => ({ layers: [] }),
  on: vi.fn(),
  off: vi.fn(),
});

beforeEach(() => {
  showLocalVectorLayer.mockClear();
  hideLocalVectorLayer.mockClear();
});

/**
 * How many times this layer in particular was drawn.
 *
 * By layer id, not by call count: the EAO footprints are drawn without being
 * switched on, so a total counts a layer these tests are not about.
 */
const drawsOf = (objectName: string) =>
  showLocalVectorLayer.mock.calls.filter(
    (call) => call[1] === localLayerId(objectName),
  ).length;

afterEach(cleanup);

describe("the hosted layer's line width", () => {
  // Session state like the on/off above: PIP has no row to carry a setting.

  /** A map reporting the layer as drawn, so the width reaches a paint call. */
  const drawnMap = () => ({
    ...fakeMap(),
    getLayer: () => ({}),
    setFilter: vi.fn(),
  });

  const widthsPainted = (map: { setPaintProperty: ReturnType<typeof vi.fn> }) =>
    map.setPaintProperty.mock.calls
      .filter((call) => call[1] === "line-width")
      .map((call) => call[2]);

  it("strokes the width the user set", async () => {
    const map = drawnMap();
    renderPanel(map);
    await userEvent.click(toggle());

    await userEvent.click(widthSlider());

    expect(widthsPainted(map)).toContain(1.5);
  });

  it("keeps the width across a panel close", async () => {
    const panel = renderPanel(drawnMap());
    await userEvent.click(toggle());
    await userEvent.click(widthSlider());

    panel.reopen(false);
    panel.reopen(true);

    // Held by the provider, which the panel's sections do not unmount.
    expect(widthShown()).toBe("1.5");
  });

  it("restrokes the width when the layer is switched off and on again", async () => {
    const map = drawnMap();
    renderPanel(map);
    await userEvent.click(toggle());
    await userEvent.click(widthSlider());

    await userEvent.click(toggle());
    map.setPaintProperty.mockClear();
    await userEvent.click(toggle());

    expect(widthsPainted(map)).toContain(1.5);
  });
});

describe("the hosted layer across a panel close", () => {
  it("stays on when the panel is closed and reopened", async () => {
    const panel = renderPanel(fakeMap());
    await userEvent.click(toggle());
    expect(drawsOf(PIP_OBJECT_NAME)).toBe(1);

    panel.reopen(false);
    panel.reopen(true);

    // The regression: this read false, the state having lived in the section
    // that was just unmounted.
    expect(isOn()).toBe(true);
  });

  it("is not taken off the map when the panel closes", () => {
    const panel = renderPanel(fakeMap());
    hideLocalVectorLayer.mockClear();

    panel.reopen(false);

    expect(hideLocalVectorLayer).not.toHaveBeenCalled();
  });

  it("is drawn once, not again on every reopen", async () => {
    const panel = renderPanel(fakeMap());
    await userEvent.click(toggle());

    panel.reopen(false);
    panel.reopen(true);

    // The draw effect is the provider's, which never unmounted.
    expect(drawsOf(PIP_OBJECT_NAME)).toBe(1);
  });

  it("comes off the map when the user switches it off", async () => {
    renderPanel(fakeMap());

    await userEvent.click(toggle());
    hideLocalVectorLayer.mockClear();
    await userEvent.click(toggle());

    expect(hideLocalVectorLayer).toHaveBeenCalledTimes(1);
    expect(isOn()).toBe(false);
  });
});
