// @vitest-environment jsdom
//
// What the selection does when the filters move under it. The map itself is not
// exercised - it wants a WebGL context jsdom cannot give - so this renders with
// no map and checks the one rule that does not need one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
