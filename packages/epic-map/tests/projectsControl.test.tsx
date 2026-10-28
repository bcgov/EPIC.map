// @vitest-environment jsdom
//
// What the selection and the hover do when the filters move under them. The
// drawing helpers want a WebGL context jsdom cannot give, so they are stubbed
// and the rest runs against a fake map that captures the handlers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { MapProject } from "@/components/Filters/filterUtils";
import type { ProjectFeatures } from "@/api/useProjects";

const project = (id: number): MapProject => ({
  id,
  name: `Project ${id}`,
  latitude: 50,
  longitude: -123,
  typeId: 1,
  regionId: 1,
  certificateIssued: false,
  inProgressWorks: false,
});

const feature = (id: number): ProjectFeatures["features"][number] => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [-123, 50] },
  properties: {
    id,
    name: `Project ${id}`,
    typeId: 1,
    typeName: "Mines",
    regionId: 1,
    certificateIssued: false,
    hasWorksInProgress: false,
  },
});

const state: { data: ProjectFeatures | undefined; visible: MapProject[] } = {
  data: undefined,
  visible: [],
};

vi.mock("@/api/useProjects", () => ({
  useProjectFeatures: () => ({ data: state.data }),
  useProject: () => ({ data: undefined, error: null, isLoading: false }),
}));

// hoveredProjectAt and projectIdAt stay real: what they read off the map is
// what these tests are about.
vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showProjects: vi.fn(),
  setSelectedProject: vi.fn(),
  addMissingProjectImage: vi.fn(),
  keepProjectsOnTop: vi.fn(),
}));

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ visibleProjects: state.visible }),
}));

// The card reaches for the widget's api client; what it draws is its own test.
vi.mock("@/components/Projects/ProjectCard", () => ({
  default: () => <div data-testid="project-card" />,
}));

const { default: ProjectsControl } = await import(
  "@/components/Projects/ProjectsControl"
);

const features = (ids: number[]): ProjectFeatures => ({
  type: "FeatureCollection",
  features: ids.map(feature),
});

/** A dot under the pointer, as queryRenderedFeatures hands it back. */
const dot = (id: number) => ({
  id,
  properties: { name: `Project ${id}`, hasWorksInProgress: false },
  geometry: { type: "Point", coordinates: [-123, 50] },
});

/** `dots` is read on every query, so a test can take them away mid-run. */
const fakeMap = (dots: unknown[]) => ({
  on: vi.fn(),
  off: vi.fn(),
  getLayer: (id: string) => ({ id }),
  queryRenderedFeatures: () => dots,
  project: () => ({ x: 120, y: 80 }),
  getCanvas: () => ({ style: {} }),
  getContainer: () => ({ clientWidth: 1200 }),
});

type FakeMap = ReturnType<typeof fakeMap>;

/** The handler the component registered for a map event. */
const handlerFor = (map: FakeMap, event: string) => {
  const call = map.on.mock.calls.find((args) => args[0] === event);
  expect(call).toBeDefined();
  return call?.at(-1) as (event?: unknown) => void;
};

const hoverOver = (map: FakeMap) =>
  act(() => handlerFor(map, "mousemove")({ point: { x: 1, y: 1 } }));

beforeEach(() => {
  state.data = features([1, 2]);
  state.visible = [project(1), project(2)];
});
afterEach(cleanup);

describe("the selection against the filters", () => {
  it("keeps the card while the project still passes them", () => {
    const onSelect = vi.fn();
    render(<ProjectsControl map={null} selectedId={1} onSelect={onSelect} />);

    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * The gap this closes: a filter excluding the selected project took its dot
   * off the map but left the card open, describing a project the map said was
   * not there - and with no dot left to click, nothing on the map could dismiss
   * it.
   */
  it("drops the selection when a filter excludes the project", () => {
    state.visible = [project(2)];
    const onSelect = vi.fn();
    render(<ProjectsControl map={null} selectedId={1} onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  // An empty list before the first response is not a filter excluding anything.
  it("keeps the selection while the list has not arrived", () => {
    state.data = undefined;
    state.visible = [];
    const onSelect = vi.fn();
    render(<ProjectsControl map={null} selectedId={1} onSelect={onSelect} />);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does nothing when there is no selection to drop", () => {
    state.visible = [];
    const onSelect = vi.fn();
    render(<ProjectsControl map={null} selectedId={null} onSelect={onSelect} />);

    expect(onSelect).not.toHaveBeenCalled();
  });
});

/**
 * Both rules take the name back down, and both were invisible to the suite: the
 * reviewer removed either one and every test still passed.
 */
describe("the name on hover", () => {
  it("names the hovered project, and takes it down on mouse-out", () => {
    const map = fakeMap([dot(1)]);
    render(
      <ProjectsControl map={map as never} selectedId={null} onSelect={vi.fn()} />,
    );

    hoverOver(map);
    expect(screen.getByText("Project 1")).toBeDefined();

    act(() => handlerFor(map, "mouseleave")());
    expect(screen.queryByText("Project 1")).toBeNull();
  });

  // A basemap switch rebuilds the style; the dots are carried over, but if one
  // is not, its name must not be left behind over an empty patch of map.
  it("takes the name down when a style change loses the dot", () => {
    const dots = [dot(1)];
    const map = fakeMap(dots);
    render(
      <ProjectsControl map={map as never} selectedId={null} onSelect={vi.fn()} />,
    );

    hoverOver(map);
    expect(screen.getByText("Project 1")).toBeDefined();

    dots.length = 0;
    act(() => handlerFor(map, "styledata")());

    expect(screen.queryByText("Project 1")).toBeNull();
  });

  // A dot filtered out from under a still pointer sends no mouseleave, so the
  // name would be left over an empty patch of map.
  it("takes the name down when a filter excludes the hovered project", () => {
    const map = fakeMap([dot(1)]);
    const view = render(
      <ProjectsControl map={map as never} selectedId={null} onSelect={vi.fn()} />,
    );

    hoverOver(map);
    expect(screen.getByText("Project 1")).toBeDefined();

    state.visible = [project(2)];
    view.rerender(
      <ProjectsControl map={map as never} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(screen.queryByText("Project 1")).toBeNull();
  });
});
