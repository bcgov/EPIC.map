// @vitest-environment jsdom
//
// The "Zoom in to view" prompt on a hosted layer's row.
//
// PIP draws from zoom 6, so switching it on over the whole province left the
// map blank with nothing in the row to say why. Its floor comes from the
// layer's own style rather than from the warehouse.
//
// The style hook is the real one here, over a stubbed `api.get`: it keys each
// floor by object name and the provider looks it up by object name, and a
// mocked hook asserts that convention rather than testing it. Keyed wrongly,
// the lookup falls back to MIN_ZOOM and the prompt never appears - which is
// this ticket's bug, so it is the one thing these tests cannot take on trust.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const PIP_FLOOR = 6;

const focusLayerAt = vi.fn();

const UNREACHABLE = "Could not reach the data catalogue - try again";

let focusErrors: Record<string, string> = {};

// Mocked to their empty states: each would otherwise want a server.
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
  UNREACHABLE_MESSAGE: UNREACHABLE,
  useLayerFocus: () => ({
    focusLayer: focusLayerAt,
    focusPendingIds: new Set(),
    focusErrors,
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
  useImportedLayersOnMap: () => ({
    failedIds: new Set(),
    retryFeatures: vi.fn(),
  }),
}));
// The expanded panel under the row, not what this file is about.
vi.mock("@/api/useLocalLayerInfo", () => ({
  useLocalLayerInfo: () => ({ data: undefined, isPending: false }),
}));

const apiGet = vi.fn();

vi.mock("@/widget/MapWidgetContext", () => ({
  useMapWidget: () => ({
    apiBaseUrl: "https://map-api.example.invalid/api",
    api: { get: apiGet },
  }),
}));

// One array, not a fresh one per render, which would churn the draw effect.
const NO_PROJECTS: never[] = [];
vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ visibleProjects: NO_PROJECTS }),
}));

const { LayersProvider } = await import("@/components/Layers/LayersContext");
const { default: LayerRow } = await import("@/components/Layers/LayerRow");
const { EAO_OBJECT_NAME, PIP_OBJECT_NAME, localLayerId } = await import(
  "@/utils/localLayers"
);
const { FOCUS_FLY_MS, LOCAL_TILE_MAX_ZOOM } = await import("@/utils/config");

const PIP_NAME = "First Nation Consultation Areas";

const pipLayer = {
  id: localLayerId(PIP_OBJECT_NAME),
  objectName: PIP_OBJECT_NAME,
  name: PIP_NAME,
} as never;

/** PIP as map-api sends it: outlines, gated at 1:6,000,000, which is zoom 6. */
const PIP_STYLE = {
  source: { minZoom: PIP_FLOOR, maxZoom: LOCAL_TILE_MAX_ZOOM },
  layers: [
    {
      id: "line",
      type: "line",
      sourceLayer: "pip_consultation_areas",
      paint: { "line-color": "#5B2D75" },
    },
  ],
};

/** The footprints, which are drawn whether or not a row asks for them. */
const EAO_STYLE = {
  source: { minZoom: null, maxZoom: LOCAL_TILE_MAX_ZOOM },
  layers: [],
};

const styleFor: Record<string, unknown> = {
  [`/local/layers/${PIP_OBJECT_NAME}/style`]: PIP_STYLE,
  [`/local/layers/${EAO_OBJECT_NAME}/style`]: EAO_STYLE,
};

/**
 * A map whose zoom the test drives: the provider subscribes to `zoom`, so
 * moving the camera and firing it is what a gesture delivers here.
 */
const fakeMap = (startZoom: number) => {
  const handlers = new Set<() => void>();
  let zoom = startZoom;

  return {
    isStyleLoaded: () => true,
    getZoom: () => zoom,
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
    easeTo: vi.fn((options: { zoom?: number }) => {
      if (options.zoom !== undefined) zoom = options.zoom;
      handlers.forEach((handler) => handler());
    }),
    on: (event: string, handler: () => void) => {
      if (event === "zoom") handlers.add(handler);
    },
    off: (event: string, handler: () => void) => {
      if (event === "zoom") handlers.delete(handler);
    },
    /** A gesture: the camera moves, then the map says so. */
    zoomTo: (next: number) => {
      zoom = next;
      act(() => handlers.forEach((handler) => handler()));
    },
  };
};

type FakeMap = ReturnType<typeof fakeMap>;

const toggle = () =>
  screen.getByRole("checkbox", { name: `Show ${PIP_NAME} on the map` });

const prompt = () =>
  screen.queryByRole("button", { name: /^Zoom in to view/ });

const findPrompt = () =>
  screen.findByRole("button", { name: /^Zoom in to view/ });

/**
 * That PIP's style has arrived: the layer reaches the map on the same render
 * the floor reaches the row. Without waiting for it an absent prompt proves
 * nothing, the floor having simply not landed yet.
 */
const drawn = (map: FakeMap) =>
  waitFor(() =>
    expect(
      map.addLayer.mock.calls.some((call) =>
        String((call[0] as { id: string }).id).includes(PIP_OBJECT_NAME),
      ),
    ).toBe(true),
  );

const renderRow = (map: FakeMap) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LayersProvider map={map as never}>
        <LayerRow layer={pipLayer} />
      </LayersProvider>
    </QueryClientProvider>,
  );
  return map;
};

beforeEach(() => {
  focusLayerAt.mockClear();
  focusErrors = {};
  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    const data = styleFor[path];
    if (!data) throw new Error(`unexpected request: ${path}`);
    return Promise.resolve({ data });
  });
});

afterEach(cleanup);

describe("the PIP row's zoom prompt", () => {
  it("prompts when the layer is switched on below its floor", async () => {
    renderRow(fakeMap(4));
    expect(prompt()).toBe(null);

    await userEvent.click(toggle());

    expect(await findPrompt()).not.toBe(null);
  });

  it("names the zoom the layer's own style draws at", async () => {
    renderRow(fakeMap(4));
    await userEvent.click(toggle());

    expect((await findPrompt()).getAttribute("aria-label")).toBe(
      `Zoom in to view ${PIP_NAME}. This layer draws at zoom ${PIP_FLOOR} and closer in`,
    );
  });

  it("says nothing when the map is already at the floor", async () => {
    const map = renderRow(fakeMap(PIP_FLOOR));
    await userEvent.click(toggle());
    await drawn(map);

    expect(prompt()).toBe(null);

    // And the floor was live rather than missing: back out and it prompts.
    map.zoomTo(PIP_FLOOR - 1);
    expect(prompt()).not.toBe(null);
  });

  it("follows the zoom rather than only the toggle", async () => {
    const map = renderRow(fakeMap(4));
    await userEvent.click(toggle());
    await findPrompt();

    map.zoomTo(PIP_FLOOR + 1);
    expect(prompt()).toBe(null);

    // Back out over the threshold: the outlines go, so the prompt returns.
    map.zoomTo(PIP_FLOOR - 1);
    expect(prompt()).not.toBe(null);
  });

  it("says nothing while the layer is off, blank map or not", async () => {
    renderRow(fakeMap(4));
    await userEvent.click(toggle());
    await findPrompt();

    await userEvent.click(toggle());

    expect(prompt()).toBe(null);
  });

  it("zooms to the floor on a press, and clears itself", async () => {
    const map = renderRow(fakeMap(4));
    await userEvent.click(toggle());

    await userEvent.click(await findPrompt());

    // In to the floor from wherever the user is looking, not a fit to bounds:
    // PIP covers BC, so that would frame the province and draw nothing.
    expect(map.easeTo).toHaveBeenCalledWith({
      zoom: PIP_FLOOR,
      duration: FOCUS_FLY_MS,
    });
    expect(focusLayerAt).not.toHaveBeenCalled();
    expect(prompt()).toBe(null);
  });
});

// The row reads a failed press by layer id, whatever kind of layer it is.
describe("the prompt after a failed press", () => {
  it("offers a refresh, with the reason in its name, when the warehouse was unreachable", async () => {
    focusErrors = { [localLayerId(PIP_OBJECT_NAME)]: UNREACHABLE };
    renderRow(fakeMap(4));
    await userEvent.click(toggle());

    const refresh = await screen.findByRole("button", { name: /^Refresh/ });
    expect(refresh.getAttribute("aria-label")).toBe(
      `Refresh zoom to ${PIP_NAME}. ${UNREACHABLE}`,
    );
    // The aria-label hides the visible text from a role query.
    expect(refresh.textContent).toBe("Refresh");
    expect(refresh.querySelector('[data-testid="RefreshIcon"]')).not.toBe(null);
    expect(prompt()).toBe(null);
  });

  it("keeps the zoom prompt when pressing again cannot help", async () => {
    const noFeatures = "This layer publishes nothing to zoom to";
    focusErrors = { [localLayerId(PIP_OBJECT_NAME)]: noFeatures };
    renderRow(fakeMap(4));
    await userEvent.click(toggle());

    const zoom = await findPrompt();
    expect(zoom.getAttribute("aria-label")).toBe(
      `Zoom in to view ${PIP_NAME}. ${noFeatures}`,
    );
    expect(zoom.textContent).toBe("Zoom in to view");
    expect(zoom.querySelector('[data-testid="ZoomInIcon"]')).not.toBe(null);
  });
});
