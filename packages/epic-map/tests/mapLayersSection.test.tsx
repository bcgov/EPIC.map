// @vitest-environment jsdom
//
// What the section draws from a project's components, and what its toggles
// reveal on the map. How they are grouped is componentGrouping's own test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProjectComponent } from "@/api/useProjects";
import {
  RevealedComponentsProvider,
  useRevealedComponents,
} from "@/components/Projects/RevealedComponentsContext";

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
  ...overrides,
});

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
  }),
];

const state: { components: ProjectComponent[] } = { components: COMPONENTS };

vi.mock("@/api/useProjects", () => ({
  useProjectComponents: () => ({
    data: state.components,
    isLoading: false,
    isError: false,
  }),
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

const renderSection = () =>
  render(
    <RevealedComponentsProvider>
      <MapLayersSection projectId={7} />
      <Probe />
    </RevealedComponentsProvider>,
  );

beforeEach(() => {
  state.components = COMPONENTS;
  revealed.ids = [];
  revealed.hidden = [];
  revealed.selected = [];
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
