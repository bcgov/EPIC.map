// @vitest-environment jsdom
//
// What the section draws from a project's components, and what its toggles
// reveal on the map. How they are grouped is componentGrouping's own test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ProjectComponent } from "@/api/useProjects";
import { MeasureProvider } from "@/components/MapTools/MeasureContext";
import {
  SelectAreaProvider,
  useSelectArea,
} from "@/components/MapTools/SelectAreaContext";
import {
  RevealedComponentsProvider,
  useRevealedComponents,
} from "@/components/Projects/RevealedComponentsContext";
import type { MapExtent } from "@/types";

const component = (overrides: Partial<ProjectComponent>): ProjectComponent => ({
  featureId: "{F1}",
  label: "Access Route",
  componentType: "Project component",
  category: "Project Notification",
  subcategory: "Pre EA",
  number: null,
  source: "Proponent",
  comment: null,
  date: "2026-08-25",
  styleCategory: "project_component",
  sensitive: false,
  adjusted: false,
  footprint: false,
  bounds: [-123, 49, -123, 49],
  ...overrides,
});

const SHREW_BOUNDS: MapExtent = [-122.5, 49.1, -122.2, 49.4];

const COMPONENTS = [
  component({ featureId: "{P1}", label: "Access Route", comment: "Amendment 1" }),
  component({
    featureId: "{V1}",
    componentType: "Value component",
    label: "Wildlife Habitat Area",
    comment: "Data sensitive",
  }),
  component({
    featureId: "{V2}",
    componentType: "Value component",
    label: "Wildlife Habitat Area",
    comment: "Pacific Water Shrew",
    bounds: SHREW_BOUNDS,
  }),
];

const state: {
  components: ProjectComponent[];
  /** EAO features under a map click, topmost first. */
  underClick: string[];
  onDot: boolean;
} = { components: COMPONENTS, underClick: [], onDot: false };

vi.mock("@/api/useProjects", () => ({
  useProjectComponents: () => ({
    data: state.components,
    isLoading: false,
    isError: false,
  }),
}));

// What a click hits is eaoVisibility's and projectUtils' own test.
vi.mock("@/components/Layers/eaoVisibility", () => ({
  eaoFeatureIdsAt: () => state.underClick,
}));

const frameBesideCard = vi.fn<(map: unknown, bounds: MapExtent) => void>();
vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasProjectAt: () => state.onDot,
  frameBesideCard: (map: unknown, bounds: MapExtent) =>
    frameBesideCard(map, bounds),
}));

const scrollIntoNearestView = vi.fn<(element: HTMLElement | null) => void>();
vi.mock("@/utils/scroll", () => ({
  scrollIntoNearestView: (element: HTMLElement | null) =>
    scrollIntoNearestView(element),
}));

const { default: MapLayersSection } = await import(
  "@/components/Projects/MapLayersSection"
);

/** What the EAO layer would be told to draw, and to highlight. */
const revealed: {
  ids: readonly string[];
  hidden: readonly string[];
  selected: readonly string[];
} = { ids: [], hidden: [], selected: [] };

const Probe = () => {
  const { featureIds, hiddenFootprintIds, selectedFeatureIds } = useRevealedComponents();
  revealed.ids = featureIds;
  revealed.hidden = hiddenFootprintIds;
  revealed.selected = selectedFeatureIds;
  return null;
};

type Listener = (event: unknown) => void;

/** Keeps its listeners, so a test can click and move over it. */
const fakeMap = () => {
  const listeners = new Map<string, Set<Listener>>();
  const of = (type: string) => listeners.get(type) ?? new Set<Listener>();
  const fire = (type: string) =>
    act(() => of(type).forEach((listener) => listener({ point: { x: 1, y: 1 } })));
  const canvas = { style: { cursor: "" } };
  return {
    on: (type: string, listener: Listener) =>
      listeners.set(type, of(type).add(listener)),
    off: (type: string, listener: Listener) => of(type).delete(listener),
    getCanvas: () => canvas,
    canvas,
    click: () => fire("click"),
    move: () => fire("mousemove"),
    out: () => fire("mouseout"),
    listening: () => [...listeners.values()].some((set) => set.size > 0),
  };
};

type FakeMap = ReturnType<typeof fakeMap>;

const renderSection = (map: FakeMap | null = null) =>
  render(
    <RevealedComponentsProvider>
      <MapLayersSection projectId={7} map={map as never} />
      <Probe />
    </RevealedComponentsProvider>,
  );

beforeEach(() => {
  state.components = COMPONENTS;
  state.underClick = [];
  state.onDot = false;
  scrollIntoNearestView.mockClear();
  revealed.ids = [];
  revealed.hidden = [];
  revealed.selected = [];
  frameBesideCard.mockClear();
});
afterEach(cleanup);

describe("the project panel's Map Layers", () => {
  it("shows Project Components then Value Components", () => {
    renderSection();

    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Project Components",
      "Value Components",
    ]);
  });

  it("collapses a component type section", () => {
    renderSection();

    const toggle = screen.getByRole("button", { name: "Project Components" });
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("heads each submission with its title, date and source", () => {
    renderSection();

    expect(
      screen.getAllByRole("heading", { level: 5, name: "Project Notification · Pre EA" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("25 Aug 2026")).toHaveLength(2);
    expect(screen.getAllByText("Proponent")).toHaveLength(2);
  });

  it("shows a single-comment label as one row, with its comment beneath", () => {
    renderSection();

    expect(screen.getByText("Access Route")).toBeDefined();
    expect(screen.getByText("Amendment 1")).toBeDefined();
  });

  it("shows a row per comment where a label's comments differ", () => {
    renderSection();

    expect(screen.getAllByText("Wildlife Habitat Area")).toHaveLength(1);
    expect(screen.getByText("Data sensitive")).toBeDefined();
    expect(screen.getByText("Pacific Water Shrew")).toBeDefined();
  });

  it("puts every submission on the map to begin with", () => {
    renderSection();

    expect(revealed.ids).toEqual(["{P1}", "{V1}", "{V2}"]);
  });

  it("takes a submission off the map with its toggle, and back on", () => {
    renderSection();
    const [projectToggle] = screen.getAllByRole("checkbox", {
      name: "Show Project Notification · Pre EA on the map",
    });

    fireEvent.click(projectToggle);
    expect(revealed.ids).toEqual(["{V1}", "{V2}"]);

    fireEvent.click(projectToggle);
    expect(revealed.ids).toEqual(["{P1}", "{V1}", "{V2}"]);
  });

  it("takes everything off the map when the panel closes", () => {
    const { rerender } = renderSection();

    rerender(
      <RevealedComponentsProvider>
        <Probe />
      </RevealedComponentsProvider>,
    );

    expect(revealed.ids).toEqual([]);
  });

  it("says so when nothing has been submitted", () => {
    state.components = [];
    renderSection();

    expect(
      screen.getByText("No project or value components published yet for this project."),
    ).toBeDefined();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });
});

describe("a long submission", () => {
  const labels = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      component({ featureId: `{L${index}}`, label: `Component ${index + 1}` }),
    );

  it("shows the first 5 components and collapses the rest", () => {
    state.components = labels(7);
    renderSection();

    expect(screen.getByText("Component 5")).toBeDefined();
    expect(screen.queryByText("Component 6")).toBeNull();
    expect(screen.getByRole("button", { name: "Show all 7 components" })).toBeDefined();
  });

  it("counts merged rows, not features", () => {
    state.components = [
      ...labels(6),
      component({ featureId: "{X1}", label: "Component 1" }),
      component({ featureId: "{X2}", label: "Component 1" }),
    ];
    renderSection();

    expect(screen.getByRole("button", { name: "Show all 6 components" })).toBeDefined();
  });

  it("shows all, then fewer", () => {
    state.components = labels(7);
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Show all 7 components" }));
    expect(screen.getByText("Component 7")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Component 7")).toBeNull();
  });

  it("keeps collapsed components on the map", () => {
    state.components = labels(7);
    renderSection();

    expect(revealed.ids).toHaveLength(7);
  });

  it("has no control at 5 components or fewer", () => {
    state.components = labels(5);
    renderSection();

    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});

describe("row flags", () => {
  it("shows Sensitive and Adjusted by GIS where they apply", () => {
    state.components = [
      component({ featureId: "{S1}", label: "Laydown Area", sensitive: true }),
      component({ featureId: "{A1}", label: "Step-Up Station", adjusted: true }),
      component({ featureId: "{N1}", label: "Access Route" }),
    ];
    renderSection();

    expect(screen.getAllByText("Sensitive")).toHaveLength(1);
    expect(screen.getAllByText("Adjusted by GIS")).toHaveLength(1);
  });
});

describe("a component's eye", () => {
  const eye = (name: string) =>
    screen.getByRole("button", { name: `Show ${name} on the map` });

  it("takes a row off the map, and back on", () => {
    renderSection();

    fireEvent.click(eye("Access Route"));
    expect(revealed.ids).toEqual(["{V1}", "{V2}"]);
    expect(eye("Access Route").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(eye("Access Route"));
    expect(revealed.ids).toEqual(["{P1}", "{V1}", "{V2}"]);
  });

  it("tells the map only of the footprints it hides", () => {
    state.components = [
      component({ featureId: "{FP}", label: "Project Footprint", footprint: true }),
      component({ featureId: "{P1}", label: "Access Route" }),
    ];
    renderSection();

    fireEvent.click(eye("Project Footprint"));
    fireEvent.click(eye("Access Route"));
    expect(revealed.hidden).toEqual(["{FP}"]);
  });

  it("starts sensitive features off the map", () => {
    state.components = [
      component({ featureId: "{S1}", label: "Laydown Area", sensitive: true }),
      component({ featureId: "{N1}", label: "Access Route" }),
    ];
    renderSection();

    expect(revealed.ids).toEqual(["{N1}"]);
    expect(eye("Laydown Area").getAttribute("aria-pressed")).toBe("false");
  });

  it("takes a whole label off the map from the label's eye", () => {
    renderSection();

    fireEvent.click(eye("Wildlife Habitat Area"));

    expect(revealed.ids).toEqual(["{P1}"]);
    expect(eye("Wildlife Habitat Area: Data sensitive").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(
      eye("Wildlife Habitat Area: Pacific Water Shrew").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("keeps the label's eye on until its last variant is hidden", () => {
    renderSection();
    const label = eye("Wildlife Habitat Area");

    fireEvent.click(eye("Wildlife Habitat Area: Data sensitive"));
    expect(revealed.ids).toEqual(["{P1}", "{V2}"]);
    expect(label.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(eye("Wildlife Habitat Area: Pacific Water Shrew"));
    expect(label.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("selecting a component", () => {
  const row = (name: string) => screen.getByRole("button", { name });

  it("selects a row and highlights it on the map", () => {
    renderSection();

    fireEvent.click(row("Access Route Amendment 1"));

    expect(row("Access Route Amendment 1").getAttribute("aria-pressed")).toBe("true");
    expect(revealed.selected).toEqual(["{P1}"]);
  });

  it("selects one variant of a label", () => {
    renderSection();

    fireEvent.click(row("Pacific Water Shrew"));

    expect(revealed.selected).toEqual(["{V2}"]);
  });

  it("clears the selection when the row is clicked again", () => {
    renderSection();

    fireEvent.click(row("Pacific Water Shrew"));
    fireEvent.click(row("Pacific Water Shrew"));

    expect(row("Pacific Water Shrew").getAttribute("aria-pressed")).toBe("false");
    expect(revealed.selected).toEqual([]);
  });

  it("highlights nothing while the selection is off the map", () => {
    renderSection();

    fireEvent.click(row("Pacific Water Shrew"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show Wildlife Habitat Area: Pacific Water Shrew on the map",
      }),
    );

    expect(revealed.selected).toEqual([]);
  });

  it("keeps the selection in view when the list collapses", () => {
    state.components = Array.from({ length: 7 }, (_, index) =>
      component({ featureId: `{L${index}}`, label: `Component ${index + 1}` }),
    );
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Show all 7 components" }));
    fireEvent.click(row("Component 7"));
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));

    expect(screen.getByText("Component 7")).toBeDefined();
    expect(screen.queryByText("Component 6")).toBeNull();
  });
});

describe("moving the map to a selected component", () => {
  const row = (name: string) => screen.getByRole("button", { name });

  it("frames the row that was clicked", () => {
    const map = fakeMap();
    renderSection(map);

    fireEvent.click(row("Pacific Water Shrew"));

    expect(frameBesideCard).toHaveBeenCalledTimes(1);
    expect(frameBesideCard).toHaveBeenCalledWith(map, SHREW_BOUNDS);
  });

  it("frames every feature of the row together", () => {
    state.components = [
      component({ featureId: "{A1}", bounds: [-124, 50, -123.5, 50.5] }),
      component({ featureId: "{A2}", bounds: [-123, 49, -123, 49] }),
    ];
    const map = fakeMap();
    renderSection(map);

    fireEvent.click(row("Access Route"));

    expect(frameBesideCard).toHaveBeenCalledWith(map, [-124, 49, -123, 50.5]);
  });

  it("frames only the features drawn, leaving a hidden sensitive one out", () => {
    state.components = [
      component({ featureId: "{A1}", bounds: [-124, 50, -123.5, 50.5] }),
      component({ featureId: "{S1}", sensitive: true, bounds: [-120, 55, -120, 55] }),
    ];
    const map = fakeMap();
    renderSection(map);

    fireEvent.click(row("Access Route"));

    expect(frameBesideCard).toHaveBeenCalledWith(map, [-124, 50, -123.5, 50.5]);
  });

  it("moves to a newly selected component", () => {
    const map = fakeMap();
    renderSection(map);

    fireEvent.click(row("Access Route Amendment 1"));
    fireEvent.click(row("Pacific Water Shrew"));

    expect(frameBesideCard).toHaveBeenCalledTimes(2);
    expect(frameBesideCard).toHaveBeenLastCalledWith(map, SHREW_BOUNDS);
  });

  it("stays put when the selected row is clicked again", () => {
    renderSection(fakeMap());

    fireEvent.click(row("Pacific Water Shrew"));
    fireEvent.click(row("Pacific Water Shrew"));

    expect(frameBesideCard).toHaveBeenCalledTimes(1);
  });

  it("stays put when the selected component is taken off the map", () => {
    renderSection(fakeMap());

    fireEvent.click(row("Pacific Water Shrew"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show Wildlife Habitat Area: Pacific Water Shrew on the map",
      }),
    );

    expect(frameBesideCard).toHaveBeenCalledTimes(1);
  });

  it("stays put for a component that is off the map", () => {
    state.components = [
      component({ featureId: "{S1}", label: "Laydown Area", sensitive: true }),
    ];
    renderSection(fakeMap());

    fireEvent.click(row("Laydown Area"));

    expect(frameBesideCard).not.toHaveBeenCalled();
  });

  it("stays put before the map has loaded", () => {
    renderSection(null);

    fireEvent.click(row("Pacific Water Shrew"));

    expect(frameBesideCard).not.toHaveBeenCalled();
  });
});

describe("sharing the component highlight with Select area", () => {
  const row = (name: string) => screen.getByRole("button", { name });
  const area: { current: ReturnType<typeof useSelectArea> | null } = {
    current: null,
  };

  const AreaProbe = () => {
    const value = useSelectArea();
    useEffect(() => {
      area.current = value;
    });
    return null;
  };

  const renderShared = () =>
    render(
      <SelectAreaProvider>
        <RevealedComponentsProvider>
          <MapLayersSection projectId={7} map={null} />
          <Probe />
          <AreaProbe />
        </RevealedComponentsProvider>
      </SelectAreaProvider>,
    );

  it("lets go of its row when a Select area row is clicked", () => {
    renderShared();
    fireEvent.click(row("Access Route Amendment 1"));

    act(() => {
      area.current?.add({ featureId: "{V2}", label: "Wildlife Habitat Area" });
      area.current?.focus("{V2}");
    });

    expect(row("Access Route Amendment 1").getAttribute("aria-pressed")).toBe("false");
    expect(revealed.selected).toEqual([]);
  });

  it("lets go of its row when a What's here result is clicked", () => {
    renderShared();
    fireEvent.click(row("Access Route Amendment 1"));

    act(() => area.current?.focusResult("catalogue:WHSE_TEST.LAYER", "WHSE_TEST.LAYER.1"));

    expect(row("Access Route Amendment 1").getAttribute("aria-pressed")).toBe("false");
    expect(revealed.selected).toEqual([]);
  });

  it("takes the highlight back from Select area when its own row is clicked", () => {
    renderShared();
    act(() => {
      area.current?.add({ featureId: "{V2}", label: "Wildlife Habitat Area" });
      area.current?.focus("{V2}");
    });

    fireEvent.click(row("Access Route Amendment 1"));

    expect(area.current?.focusedId).toBeNull();
    expect(revealed.selected).toEqual(["{P1}"]);
  });
});

describe("clicking a component on the map", () => {
  const row = (name: string) => screen.getByRole("button", { name });
  const selectedRows = () =>
    screen
      .getAllByRole("button")
      .filter(
        (button) =>
          button.getAttribute("aria-pressed") === "true" &&
          !button.getAttribute("aria-label"),
      );

  const clickOnMap = (map: FakeMap, featureIds: string[]) => {
    state.underClick = featureIds;
    map.click();
  };

  it("selects its row, highlights it and scrolls to it", () => {
    const map = fakeMap();
    renderSection(map);

    clickOnMap(map, ["{V2}"]);

    expect(row("Pacific Water Shrew").getAttribute("aria-pressed")).toBe("true");
    expect(revealed.selected).toEqual(["{V2}"]);
    expect(scrollIntoNearestView).toHaveBeenCalledWith(row("Pacific Water Shrew"));
  });

  it("replaces the row selected before, from the list or the map", () => {
    const map = fakeMap();
    renderSection(map);

    fireEvent.click(row("Access Route Amendment 1"));
    clickOnMap(map, ["{V2}"]);
    expect(selectedRows()).toEqual([row("Pacific Water Shrew")]);

    clickOnMap(map, ["{V1}"]);
    expect(selectedRows()).toEqual([row("Data sensitive")]);
    expect(revealed.selected).toEqual(["{V1}"]);
  });

  it("keeps its row selected, and in view, when clicked again", () => {
    const map = fakeMap();
    renderSection(map);

    clickOnMap(map, ["{V2}"]);
    clickOnMap(map, ["{V2}"]);

    expect(row("Pacific Water Shrew").getAttribute("aria-pressed")).toBe("true");
    expect(scrollIntoNearestView).toHaveBeenCalledTimes(2);
  });

  it("takes the topmost feature the panel lists", () => {
    const map = fakeMap();
    renderSection(map);

    clickOnMap(map, ["{ANOTHER_PROJECT}", "{V2}", "{P1}"]);

    expect(revealed.selected).toEqual(["{V2}"]);
  });

  it("leaves the selection alone where none of the panel's features were hit", () => {
    const map = fakeMap();
    renderSection(map);
    fireEvent.click(row("Access Route Amendment 1"));

    clickOnMap(map, ["{ANOTHER_PROJECT}"]);
    clickOnMap(map, []);

    expect(revealed.selected).toEqual(["{P1}"]);
    expect(scrollIntoNearestView).not.toHaveBeenCalled();
  });

  it("leaves a click on a project dot to the dot", () => {
    const map = fakeMap();
    renderSection(map);
    state.onDot = true;

    clickOnMap(map, ["{V2}"]);

    expect(revealed.selected).toEqual([]);
  });

  it("opens Show all when the row is collapsed under it", () => {
    state.components = Array.from({ length: 7 }, (_, index) =>
      component({ featureId: `{L${index}}`, label: `Component ${index + 1}` }),
    );
    const map = fakeMap();
    renderSection(map);

    clickOnMap(map, ["{L5}"]);

    expect(row("Component 6").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Component 7")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeDefined();
  });

  it("keeps Show all closed for a row already shown", () => {
    state.components = Array.from({ length: 7 }, (_, index) =>
      component({ featureId: `{L${index}}`, label: `Component ${index + 1}` }),
    );
    const map = fakeMap();
    renderSection(map);

    clickOnMap(map, ["{L1}"]);

    expect(screen.getByRole("button", { name: "Show all 7 components" })).toBeDefined();
  });

  it("opens a collapsed section, and scrolls once it has opened", async () => {
    const map = fakeMap();
    renderSection(map);
    const section = screen.getByRole("button", { name: "Value Components" });
    fireEvent.click(section);

    clickOnMap(map, ["{V2}"]);

    expect(section.getAttribute("aria-expanded")).toBe("true");
    expect(scrollIntoNearestView).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(scrollIntoNearestView).toHaveBeenCalledWith(row("Pacific Water Shrew")),
    );
  });

  it("does not scroll for a row selected from the list", () => {
    renderSection(fakeMap());

    fireEvent.click(row("Pacific Water Shrew"));

    expect(scrollIntoNearestView).not.toHaveBeenCalled();
  });

  it("leaves clicks to Measure while it places points, and stops listening on close", () => {
    const map = fakeMap();
    const area: { current: ReturnType<typeof useSelectArea> | null } = {
      current: null,
    };
    const AreaProbe = () => {
      area.current = useSelectArea();
      return null;
    };
    const { unmount } = render(
      <SelectAreaProvider>
        <MeasureProvider>
          <RevealedComponentsProvider>
            <MapLayersSection projectId={7} map={map as never} />
            <Probe />
            <AreaProbe />
          </RevealedComponentsProvider>
        </MeasureProvider>
      </SelectAreaProvider>,
    );

    act(() => area.current?.toggleTool("measure"));
    expect(map.listening()).toBe(false);

    act(() => area.current?.toggleTool("measure"));
    clickOnMap(map, ["{V2}"]);
    expect(revealed.selected).toEqual(["{V2}"]);

    unmount();
    expect(map.listening()).toBe(false);
  });
});

describe("adding to Select area", () => {
  const row = (name: string) => screen.getByRole("button", { name });
  const area: { current: ReturnType<typeof useSelectArea> | null } = {
    current: null,
  };
  const AreaProbe = () => {
    area.current = useSelectArea();
    return null;
  };
  const selectedIds = () =>
    area.current?.selected.map(({ featureId }) => featureId);

  const renderSelecting = (map: FakeMap | null = null) => {
    render(
      <SelectAreaProvider>
        <RevealedComponentsProvider>
          <MapLayersSection projectId={7} map={map as never} />
          <Probe />
          <AreaProbe />
        </RevealedComponentsProvider>
      </SelectAreaProvider>,
    );
    act(() => area.current?.toggleTool("select"));
  };

  // Picks only: MapToolsControl's add is tested there.
  const clickOnMap = (map: FakeMap, featureIds: string[]) => {
    state.underClick = featureIds;
    map.click();
  };

  beforeEach(() => {
    state.components = [
      ...COMPONENTS,
      component({ featureId: "{T1}", label: "Tailings Facility" }),
      component({ featureId: "{T2}", label: "Tailings Facility" }),
      component({ featureId: "{T3}", label: "Tailings Facility", sensitive: true }),
    ];
  });

  it("adds every drawn feature of a row picked from the list, leaving a hidden one out", () => {
    renderSelecting();

    fireEvent.click(row("Tailings Facility"));

    expect(selectedIds()).toEqual(["{T1}", "{T2}"]);
    expect(area.current?.selected[0].label).toBe("Tailings Facility");
    expect(row("Tailings Facility").getAttribute("aria-pressed")).toBe("true");
    expect(revealed.selected).toEqual(["{T1}", "{T2}"]);
  });

  it("highlights a row picked again, rather than deselecting it or adding it twice", () => {
    renderSelecting(fakeMap());

    fireEvent.click(row("Tailings Facility"));
    fireEvent.click(row("Tailings Facility"));

    expect(selectedIds()).toEqual(["{T1}", "{T2}"]);
    expect(row("Tailings Facility").getAttribute("aria-pressed")).toBe("true");
    expect(revealed.selected).toEqual(["{T1}", "{T2}"]);
    expect(frameBesideCard).toHaveBeenCalledTimes(2);
  });

  it("takes the highlight from the Selected list when a row already in is picked", () => {
    renderSelecting();
    act(() => {
      area.current?.add({ featureId: "{V2}", label: "Wildlife Habitat Area" });
      area.current?.focus("{V2}");
    });

    fireEvent.click(row("Pacific Water Shrew"));

    expect(selectedIds()).toEqual(["{V2}"]);
    expect(area.current?.focusedId).toBeNull();
    expect(revealed.selected).toEqual(["{V2}"]);
  });

  it("adds to what the map added, in one selection", () => {
    renderSelecting();
    act(() => area.current?.add({ featureId: "{P1}", label: "Access Route" }));

    fireEvent.click(row("Pacific Water Shrew"));

    expect(selectedIds()).toEqual(["{P1}", "{V2}"]);
  });

  it("adds nothing from the list while Select area is off", () => {
    renderSelecting();
    act(() => area.current?.toggleTool("select"));

    fireEvent.click(row("Pacific Water Shrew"));

    expect(selectedIds()).toEqual([]);
  });

  it("picks the row of a feature added on the map, highlighting only that feature", () => {
    const map = fakeMap();
    renderSelecting(map);
    act(() => area.current?.add({ featureId: "{T2}", label: "Tailings Facility" }));

    clickOnMap(map, ["{T2}"]);

    expect(row("Tailings Facility").getAttribute("aria-pressed")).toBe("true");
    expect(revealed.selected).toEqual(["{T2}"]);
    expect(scrollIntoNearestView).toHaveBeenCalledWith(row("Tailings Facility"));
  });

  it("highlights and scrolls to a feature clicked again on the map", () => {
    const map = fakeMap();
    renderSelecting(map);
    act(() => area.current?.add({ featureId: "{V2}", label: "Wildlife Habitat Area" }));
    clickOnMap(map, ["{V2}"]);
    act(() => area.current?.focus("{V2}"));

    clickOnMap(map, ["{V2}"]);

    expect(row("Pacific Water Shrew").getAttribute("aria-pressed")).toBe("true");
    expect(area.current?.focusedId).toBeNull();
    expect(revealed.selected).toEqual(["{V2}"]);
    expect(scrollIntoNearestView).toHaveBeenCalledTimes(2);
  });

  it("picks no row when the topmost feature, the one added, is not the panel's", () => {
    const map = fakeMap();
    renderSelecting(map);

    clickOnMap(map, ["{ANOTHER_PROJECT}", "{V2}"]);

    expect(row("Pacific Water Shrew").getAttribute("aria-pressed")).toBe("false");
    expect(scrollIntoNearestView).not.toHaveBeenCalled();
  });
});

describe("pointing at a component on the map", () => {
  const moveOver = (map: FakeMap, featureIds: string[]) => {
    state.underClick = featureIds;
    map.move();
  };

  it("points over a listed component, and stops off it", () => {
    const map = fakeMap();
    renderSection(map);

    moveOver(map, ["{ANOTHER_PROJECT}", "{V2}"]);
    expect(map.canvas.style.cursor).toBe("pointer");

    moveOver(map, ["{ANOTHER_PROJECT}"]);
    expect(map.canvas.style.cursor).toBe("");
  });

  it("points again after a dot's hover cleared the cursor", () => {
    const map = fakeMap();
    renderSection(map);

    moveOver(map, ["{V2}"]);
    map.canvas.style.cursor = "";
    moveOver(map, ["{V2}"]);

    expect(map.canvas.style.cursor).toBe("pointer");
  });

  it("leaves a cursor it did not set alone, a dot's included", () => {
    const map = fakeMap();
    renderSection(map);
    map.canvas.style.cursor = "pointer";

    moveOver(map, []);
    expect(map.canvas.style.cursor).toBe("pointer");

    moveOver(map, ["{V2}"]);
    state.onDot = true;
    map.move();
    state.onDot = false;
    moveOver(map, []);
    expect(map.canvas.style.cursor).toBe("pointer");
  });

  it("stops pointing when the mouse leaves the map, or the panel closes", () => {
    const map = fakeMap();
    const { unmount } = renderSection(map);

    moveOver(map, ["{V2}"]);
    map.out();
    expect(map.canvas.style.cursor).toBe("");

    moveOver(map, ["{V2}"]);
    unmount();
    expect(map.canvas.style.cursor).toBe("");
  });
});
