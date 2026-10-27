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

/** What the EAO layer would be told to draw. */
const revealed: { ids: readonly string[] } = { ids: [] };

const Probe = () => {
  revealed.ids = useRevealedComponents().featureIds;
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
