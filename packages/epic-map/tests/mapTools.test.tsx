// @vitest-environment jsdom
//
// The tool bar, the selection and What's here's results. Hit tests and map
// drawing need WebGL, so they are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WhatsHereLayerResult } from "@/api/useWhatsHere";

/** What a click lands on. */
const hit: {
  dot: boolean;
  feature: { featureId: string; label: string } | null;
} = { dot: false, feature: null };

vi.mock("@/components/Layers/eaoVisibility", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  eaoFeatureAt: () => hit.feature,
}));

vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasProjectAt: () => hit.dot,
}));

const CARIBOU = "WHSE_WILDLIFE_INVENTORY.GCPB_CARIBOU_POPULATION_SP";
const PIP = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";

/** What the Layers panel has on. */
const layers = {
  appliedLayers: [
    { id: "caribou", objectName: CARIBOU, name: "Caribou Herd Locations for BC" },
    { id: "off", objectName: "WHSE_TEST.SWITCHED_OFF", name: "Switched off" },
  ],
  favourites: [{ id: `local-${PIP}`, name: "Profiles of Indigenous People (PIP)" }],
  visibleIds: new Set(["caribou", `local-${PIP}`]),
  layerFloors: {},
};

vi.mock("@/components/Layers/LayersContext", () => ({ useLayers: () => layers }));

const imported = {
  layers: [{ id: "wells", name: "My wells" }],
  shownIds: new Set(["wells"]),
};

vi.mock("@/components/Layers/UserLayers/ImportedLayersContext", () => ({
  useImportedLayersContext: () => imported,
}));

const search = vi.fn<(request: unknown) => Promise<WhatsHereLayerResult[]>>();

vi.mock("@/api/useWhatsHere", () => ({
  useWhatsHereApi: () => ({ search, warehouseBounds: vi.fn() }),
}));

vi.mock("@/components/MapTools/useResultHighlight", () => ({
  useResultHighlight: () => {},
}));

// Only which result is open; the popup has its own test.
vi.mock("@/components/MapTools/ResultInfoPopup", async () => {
  const { useSelectArea } = await import("@/components/MapTools/SelectAreaContext");
  const ResultInfo = () => {
    const { info } = useSelectArea();
    return info ? <div data-testid="result-info">{info.featureKey}</div> : null;
  };
  return { default: ResultInfo };
});

const { default: MapToolsControl } = await import(
  "@/components/MapTools/MapToolsControl"
);
const { SelectAreaProvider } = await import(
  "@/components/MapTools/SelectAreaContext"
);

const INFO = "Click projects or components on the map to add them.";

const BOUNDARY = { featureId: "{F1}", label: "Project Boundary" };
const PUMPHOUSE = { featureId: "{A1}", label: "Proposed Pumphouse" };

const fakeMap = () => ({
  on: vi.fn(),
  off: vi.fn(),
  getContainer: () => ({
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }),
});
type FakeMap = ReturnType<typeof fakeMap>;

const renderTools = (map: FakeMap | null = null) =>
  render(
    <SelectAreaProvider>
      <MapToolsControl map={map as never} />
    </SelectAreaProvider>,
  );

const selectArea = () => screen.getByRole("button", { name: "Select area" });
const measure = () => screen.getByRole("button", { name: "Measure" });
const button = (name: string) => screen.getByRole("button", { name });
const selectedRows = () =>
  within(screen.getByRole("heading", { name: "Selected" }).parentElement!.parentElement!)
    .queryAllByRole("listitem");
const infoShown = () => screen.queryAllByText(INFO).length > 0;

/** Clicks the map on whatever `hit` describes. */
const clickMap = (map: FakeMap, feature: typeof hit.feature, dot = false) => {
  hit.feature = feature;
  hit.dot = dot;
  const listening = map.on.mock.calls.filter(
    ([event, handler]) =>
      event === "click" &&
      !map.off.mock.calls.some(([, removed]) => removed === handler),
  );
  act(() => listening.forEach(([, handler]) => handler({ point: { x: 1, y: 1 } })));
};

const RESULTS: WhatsHereLayerResult[] = [
  {
    kind: "catalogue",
    layer: CARIBOU,
    status: "found",
    matched: 2,
    error: null,
    features: [
      { id: `${CARIBOU}.1`, name: "Groundhog", properties: [] },
      { id: `${CARIBOU}.2`, name: "Wells Gray South", properties: [] },
    ],
  },
  {
    kind: "hosted",
    layer: PIP,
    status: "found",
    matched: 1,
    error: null,
    features: [{ id: "{P1}", name: "Adams Lake Indian Band", properties: [] }],
  },
  { kind: "imported", layer: "wells", status: "empty", matched: 0, error: null, features: [] },
];

/** Select area on, the boundary selected, What's here run and answered. */
const withResults = async (results = RESULTS) => {
  search.mockResolvedValue(results);
  const map = fakeMap();
  renderTools(map);
  await userEvent.click(selectArea());
  clickMap(map, BOUNDARY);
  await userEvent.click(button("What’s here"));
  await screen.findByRole("heading", { name: "Selected from layers" });
  return map;
};

const group = (name: string) =>
  screen.getByRole("heading", { name: new RegExp(`^${name}`) }).closest("section")!;

beforeEach(() => {
  hit.dot = false;
  hit.feature = null;
  search.mockReset();
});
afterEach(cleanup);

describe("map tools", () => {
  it("starts with both tools off and no info card", () => {
    renderTools();

    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(measure().getAttribute("aria-pressed")).toBe("false");
    expect(infoShown()).toBe(false);
  });

  it("shows the info card while Select area is on, and dismisses it when turned off", async () => {
    renderTools();

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
    expect(infoShown()).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(INFO);

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(infoShown()).toBe(false);
  });

  it("keeps the two tools mutually exclusive", async () => {
    renderTools();

    await userEvent.click(selectArea());
    await userEvent.click(measure());
    expect(measure().getAttribute("aria-pressed")).toBe("true");
    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(infoShown()).toBe(false);

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
    expect(measure().getAttribute("aria-pressed")).toBe("false");
  });
});

describe("building a selection", () => {
  it("only listens to the map while Select area is on", async () => {
    const map = fakeMap();
    renderTools(map);
    expect(map.on).not.toHaveBeenCalled();

    await userEvent.click(selectArea());
    const [[event, handler]] = map.on.mock.calls;
    expect(event).toBe("click");

    await userEvent.click(selectArea());
    expect(map.off).toHaveBeenCalledWith("click", handler);
  });

  it("adds the footprint or component under a click, once", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());

    clickMap(map, BOUNDARY);
    clickMap(map, PUMPHOUSE);
    clickMap(map, BOUNDARY);

    expect(selectedRows().map((row) => row.textContent)).toEqual([
      "Project Boundary",
      "Proposed Pumphouse",
    ]);
    expect(screen.getByText("2")).toBeDefined();
    expect(infoShown()).toBe(false);
  });

  it("adds nothing where there is no footprint or component", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());

    clickMap(map, null);

    expect(infoShown()).toBe(true);
  });

  it("leaves a click on a project dot to the dot", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());

    clickMap(map, BOUNDARY, true);

    expect(infoShown()).toBe(true);
  });

  it("shows Clear all and What's here once something is selected", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    clickMap(map, BOUNDARY);

    expect(button("Clear all")).toBeDefined();
    expect(button("What’s here")).toBeDefined();
  });

  it("toggles a row's highlight by clicking its name", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);
    clickMap(map, PUMPHOUSE);

    const name = button("Proposed Pumphouse");
    await userEvent.click(name);
    expect(name.getAttribute("aria-pressed")).toBe("true");
    expect(button("Project Boundary").getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(name);
    expect(name.getAttribute("aria-pressed")).toBe("false");
  });

  it("removes one row with its ×, and every row with Clear all", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);
    clickMap(map, PUMPHOUSE);

    await userEvent.click(button("Remove Project Boundary"));
    expect(selectedRows().map((row) => row.textContent)).toEqual(["Proposed Pumphouse"]);

    await userEvent.click(button("Clear all"));
    expect(infoShown()).toBe(true);
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
  });

  it("discards the selection when Select area is turned off", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);

    await userEvent.click(selectArea());
    await userEvent.click(selectArea());

    expect(infoShown()).toBe(true);
  });

  it("discards the selection when Measure takes over", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);

    await userEvent.click(measure());
    await userEvent.click(selectArea());

    expect(infoShown()).toBe(true);
  });
});

describe("What's here", () => {
  it("searches the switched-on layers with the selection", async () => {
    await withResults();

    expect(search).toHaveBeenCalledWith({
      selection: ["{F1}"],
      catalogue: [CARIBOU],
      hosted: [PIP],
      imported: ["wells"],
    });
  });

  it("groups the results by layer, each with its count, and leaves out layers with nothing", async () => {
    await withResults();

    expect(within(group("Caribou Herd Locations for BC")).getAllByRole("listitem").map((row) => row.textContent))
      .toEqual(["Groundhog", "Wells Gray South"]);
    expect(group("Caribou Herd Locations for BC").textContent).toContain("(2)");
    expect(group("Profiles of Indigenous People \\(PIP\\)").textContent).toContain("(1)");
    expect(screen.queryByRole("heading", { name: /My wells/ })).toBeNull();
    // Features, not layers.
    expect(screen.getByRole("status").textContent).toBe("3 features found.");
  });

  it("swaps What's here for Export once there are results", async () => {
    await withResults();

    expect(screen.queryByRole("button", { name: "What’s here" })).toBeNull();
    expect(button("Export")).toBeDefined();
  });

  it("offers no Export when nothing was found", async () => {
    await withResults([RESULTS[2]]);

    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.getByText(/Nothing on the layers/)).toBeDefined();
  });

  it("collapses and expands each group on its own", async () => {
    await withResults();
    const caribou = within(group("Caribou Herd Locations for BC")).getByRole("button", {
      name: /^Caribou Herd Locations for BC/,
    });

    await userEvent.click(caribou);
    expect(caribou.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Groundhog" })).toBeNull();
    expect(button("Adams Lake Indian Band")).toBeDefined();

    await userEvent.click(caribou);
    expect(button("Groundhog")).toBeDefined();
  });

  it("toggles a result's highlight, one row at a time", async () => {
    await withResults();

    await userEvent.click(button("Groundhog"));
    expect(button("Groundhog").getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(button("Adams Lake Indian Band"));
    expect(button("Groundhog").getAttribute("aria-pressed")).toBe("false");
    expect(button("Adams Lake Indian Band").getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(button("Adams Lake Indian Band"));
    expect(button("Adams Lake Indian Band").getAttribute("aria-pressed")).toBe("false");
  });

  it("shares the one highlight with the Selected list", async () => {
    await withResults();

    await userEvent.click(button("Groundhog"));
    await userEvent.click(button("Project Boundary"));

    expect(button("Groundhog").getAttribute("aria-pressed")).toBe("false");
    expect(button("Project Boundary").getAttribute("aria-pressed")).toBe("true");
  });

  it("opens a result's details from its info icon", async () => {
    await withResults();

    await userEvent.click(button("Details of Wells Gray South"));

    expect(screen.getByTestId("result-info").textContent).toBe(`${CARIBOU}.2`);
  });

  it("removes a result with its ×, and an emptied group with it", async () => {
    await withResults();

    await userEvent.click(button("Details of Adams Lake Indian Band"));
    await userEvent.click(button("Remove Adams Lake Indian Band"));

    expect(screen.queryByRole("heading", { name: /Profiles of Indigenous People/ })).toBeNull();
    expect(screen.queryByTestId("result-info")).toBeNull();
    expect(group("Caribou Herd Locations for BC").textContent).toContain("(2)");
  });

  it("clears a whole group with its Clear", async () => {
    await withResults();

    await userEvent.click(button("Clear Caribou Herd Locations for BC"));

    expect(screen.queryByRole("heading", { name: /Caribou/ })).toBeNull();
    expect(button("Adams Lake Indian Band")).toBeDefined();
  });

  it("resets everything with Clear all", async () => {
    await withResults();
    await userEvent.click(button("Groundhog"));

    await userEvent.click(button("Clear all"));

    expect(screen.queryByRole("heading", { name: "Selected from layers" })).toBeNull();
    expect(infoShown()).toBe(true);
  });

  it("discards the results when the selection changes", async () => {
    const map = await withResults();

    clickMap(map, PUMPHOUSE);

    expect(screen.queryByRole("heading", { name: "Selected from layers" })).toBeNull();
    expect(button("What’s here")).toBeDefined();
  });

  it("says so when a layer could not be searched", async () => {
    await withResults([
      { ...RESULTS[0], status: "error", features: [], error: "Took too long." },
    ]);

    expect(within(group("Caribou Herd Locations for BC")).getByText("Took too long.")).toBeDefined();
  });

  it("says when nothing is switched on to search, without asking", async () => {
    const [visible, shown] = [layers.visibleIds, imported.shownIds];
    layers.visibleIds = new Set();
    imported.shownIds = new Set();
    try {
      const map = fakeMap();
      renderTools(map);
      await userEvent.click(selectArea());
      clickMap(map, BOUNDARY);

      await userEvent.click(button("What’s here"));

      expect(search).not.toHaveBeenCalled();
      expect(screen.getByText(/Switch on a layer/)).toBeDefined();
      expect(button("What’s here")).toBeDefined();
    } finally {
      layers.visibleIds = visible;
      imported.shownIds = shown;
    }
  });
});
