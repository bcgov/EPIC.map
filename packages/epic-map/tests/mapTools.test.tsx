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

// Drawing needs WebGL; the distance maths stays real.
const drawMeasure = vi.fn();
const eraseMeasure = vi.fn();

vi.mock("@/components/MapTools/measure", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  drawMeasure: (...args: unknown[]) => drawMeasure(...args),
  eraseMeasure: (...args: unknown[]) => eraseMeasure(...args),
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
const { MeasureProvider } = await import("@/components/MapTools/MeasureContext");

const INFO = "Click projects or components on the map to add them.";
const MEASURE_INFO = "Click points on the map to measure or draw an area.";

const BOUNDARY = { featureId: "{F1}", label: "Project Boundary" };
const PUMPHOUSE = { featureId: "{A1}", label: "Proposed Pumphouse" };

const fakeMap = () => ({
  on: vi.fn(),
  off: vi.fn(),
  getCanvasContainer: vi.fn(() => canvasContainer),
  getContainer: () => ({
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }),
});
type FakeMap = ReturnType<typeof fakeMap>;

let canvasContainer = document.createElement("div");

const renderTools = (map: FakeMap | null = null) =>
  render(
    <SelectAreaProvider>
      <MeasureProvider>
        <MapToolsControl map={map as never} />
      </MeasureProvider>
    </SelectAreaProvider>,
  );

const selectArea = () => screen.getByRole("button", { name: "Select area" });
const measure = () => screen.getByRole("button", { name: "Measure" });
const button = (name: string) => screen.getByRole("button", { name });
const selectedRows = () =>
  within(screen.getByRole("heading", { name: "Selected" }).parentElement!.parentElement!)
    .queryAllByRole("listitem");
const infoShown = () => screen.queryAllByText(INFO).length > 0;

/** Fires a map event at the handlers still listening for it. */
const fire = (
  map: FakeMap,
  type: string,
  point = { x: 1, y: 1 },
  lngLat = { lng: 0, lat: 0 },
) => {
  const listening = map.on.mock.calls.filter(
    ([event, handler]) =>
      event === type &&
      !map.off.mock.calls.some(([, removed]) => removed === handler),
  );
  act(() => listening.forEach(([, handler]) => handler({ point, lngLat })));
};

/** Clicks the map on whatever `hit` describes. */
const clickMap = (map: FakeMap, feature: typeof hit.feature, dot = false) => {
  hit.feature = feature;
  hit.dot = dot;
  fire(map, "click");
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
  canvasContainer = document.createElement("div");
  drawMeasure.mockReset();
  eraseMeasure.mockReset();
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

describe("measuring", () => {
  // 0.01 degrees of latitude apart: about 1.1 km.
  const P1 = { lng: -123, lat: 50 };
  const P2 = { lng: -123, lat: 50.01 };
  const P3 = { lng: -123, lat: 50.02 };

  const text = (value: string) => screen.queryByText(value);
  // The status region repeats the hint.
  const card = () => screen.queryByText(MEASURE_INFO, { selector: "p" });
  const segmentRows = () =>
    screen.queryAllByRole("listitem").map((row) => row.textContent);
  const lastDrawn = () => drawMeasure.mock.calls[drawMeasure.mock.calls.length - 1];

  /** Measure on, with a point dropped at each. */
  const placing = async (...at: (typeof P1)[]) => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(measure());
    at.forEach((lngLat) => fire(map, "click", undefined, lngLat));
    return map;
  };

  it("shows the info card while Measure is on, and dismisses it when turned off", async () => {
    renderTools();

    await userEvent.click(measure());
    expect(measure().getAttribute("aria-pressed")).toBe("true");
    expect(card()).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(MEASURE_INFO);

    await userEvent.click(measure());
    expect(measure().getAttribute("aria-pressed")).toBe("false");
    expect(card()).toBeNull();
  });

  it("swaps the Select area card for its own", async () => {
    renderTools();

    await userEvent.click(selectArea());
    await userEvent.click(measure());

    expect(infoShown()).toBe(false);
    expect(card()).not.toBeNull();
  });

  it("shows a crosshair over the map while on", async () => {
    await placing();
    expect(canvasContainer.style.cursor).toBe("crosshair");

    await userEvent.click(measure());
    expect(canvasContainer.style.cursor).toBe("");
  });

  it("prompts for the first point beside the pointer, only over the map", async () => {
    const map = await placing();
    expect(text("Add first point")).toBeNull();

    fire(map, "mousemove", { x: 120, y: 80 });
    expect(text("Add first point")).not.toBeNull();
    expect(getComputedStyle(text("Add first point")!).top).toBe("80px");

    fire(map, "mouseout");
    expect(text("Add first point")).toBeNull();
  });

  it("previews the segment being drawn, with its length at the cursor", async () => {
    const map = await placing(P1);

    fire(map, "mousemove", { x: 120, y: 80 }, { lng: -123, lat: 50.003 });

    expect(text("~330 m")).not.toBeNull();
    expect(lastDrawn()).toEqual([
      map,
      [[-123, 50]],
      [
        [-123, 50],
        [-123, 50.003],
      ],
    ]);
    expect(card()).toBeNull();
    expect(screen.getByRole("heading", { name: "Line length" })).toBeDefined();
    expect(text("~0 km")).not.toBeNull();
    expect(segmentRows()).toEqual([]);
    expect(text("Click Done to measure the line")).toBeNull();
    expect(button("Done").hasAttribute("disabled")).toBe(true);
  });

  it("lists each segment and the total, with the hint, from two points", async () => {
    await placing(P1, P2, P3);

    expect(segmentRows()).toEqual([
      "Point 1 \u2192 Point 2~1.1 km",
      "Point 2 \u2192 Point 3~1.1 km",
    ]);
    expect(text("~2.2 km")).not.toBeNull();
    expect(text("Click Done to measure the line")).not.toBeNull();
    expect(button("Done").hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Line length about 2.2 km.");
  });

  it("undoes the last point, back to the empty state", async () => {
    await placing(P1, P2);

    await userEvent.click(button("Undo"));
    expect(segmentRows()).toEqual([]);
    expect(text("Click Done to measure the line")).toBeNull();

    await userEvent.click(button("Undo"));
    expect(card()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("finishes the line on Done, keeping it and its lengths but nothing to add to it", async () => {
    const map = await placing(P1, P2);
    fire(map, "mousemove", { x: 120, y: 80 }, { lng: -123, lat: 50.013 });
    expect(text("~330 m")).not.toBeNull();

    await userEvent.click(button("Done"));

    expect(lastDrawn()).toEqual([
      map,
      [
        [-123, 50],
        [-123, 50.01],
      ],
      null,
    ]);
    expect(text("~330 m")).toBeNull();
    expect(canvasContainer.style.cursor).toBe("");
    expect(card()).toBeNull();
    expect(segmentRows()).toEqual(["Point 1 \u2192 Point 2~1.1 km"]);
    expect(text("Click Done to measure the line")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(button("Clear")).toBeDefined();

    fire(map, "click", undefined, P3);
    expect(segmentRows()).toEqual(["Point 1 \u2192 Point 2~1.1 km"]);
  });

  it("clears a finished line and starts again with Measure still on", async () => {
    const map = await placing(P1, P2);
    await userEvent.click(button("Done"));

    await userEvent.click(button("Clear"));

    expect(measure().getAttribute("aria-pressed")).toBe("true");
    expect(card()).not.toBeNull();
    expect(lastDrawn()).toEqual([map, [], null]);
    expect(canvasContainer.style.cursor).toBe("crosshair");

    fire(map, "click", undefined, P1);
    expect(text("~0 km")).not.toBeNull();
  });

  it("takes the line away when Measure is turned off", async () => {
    await placing(P1, P2);

    await userEvent.click(measure());
    expect(eraseMeasure).toHaveBeenCalled();

    await userEvent.click(measure());
    expect(card()).not.toBeNull();
  });

  it("takes the line away when Select area takes over", async () => {
    await placing(P1, P2);

    await userEvent.click(selectArea());
    expect(eraseMeasure).toHaveBeenCalled();

    await userEvent.click(measure());
    expect(card()).not.toBeNull();
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

  it("leaves only Clear all once What's here has answered", async () => {
    await withResults();

    expect(screen.queryByRole("button", { name: "What’s here" })).toBeNull();
    expect(button("Clear all")).toBeDefined();
  });

  it("says when nothing was found", async () => {
    await withResults([RESULTS[2]]);

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
