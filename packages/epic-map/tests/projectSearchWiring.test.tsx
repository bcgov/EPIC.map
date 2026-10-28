// @vitest-environment jsdom
//
// The path from the search field to the project panel, end to end through the
// components rather than one callback at a time.
//
// MapSearch's own tests prove it calls the callback it is handed, and
// ProjectsControl's that it draws the card for the id it is given. Neither
// covers the owner that joins them, and MAP-89 was a break in exactly that
// join: a no-op in place of MapWidget's `setSelectedProjectId` puts the bug
// back - the camera moves and the panel does not open - with every other test
// in the suite still green.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MapProject } from "@/components/Filters/filterUtils";
import type { ProjectFeatures } from "@/api/useProjects";

/**
 * Enough of a MapLibre map for MapSurface to build one and pass it down.
 *
 * `painter` has to be truthy or MapSurface decides the browser has no WebGL2
 * and renders its unsupported notice instead of the map and its controls.
 */
class StubMap {
  painter = {};
  on = vi.fn();
  off = vi.fn();
  addControl = vi.fn();
  remove = vi.fn();
  fitBounds = vi.fn();
  setStyle = vi.fn();
  getCanvas = () => ({ style: {} });
  getContainer = () => ({ clientWidth: 1200 });
  project = () => ({ x: 0, y: 0 });
  panBy = vi.fn();
}

vi.mock("maplibre-gl", () => ({
  Map: StubMap,
  NavigationControl: class {},
  GeolocateControl: class {},
  ScaleControl: class {},
  Marker: class {},
}));

const project = (
  id: number,
  name: string,
  certificateIssued = false,
): MapProject => ({
  id,
  name,
  latitude: 53,
  longitude: -122,
  typeId: 1,
  regionId: 1,
  certificateIssued,
  inProgressWorks: false,
});

const feature = (
  id: number,
  name: string,
): ProjectFeatures["features"][number] => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [-122, 53] },
  properties: {
    id,
    name,
    typeId: 1,
    typeName: "Mines",
    regionId: 1,
    certificateIssued: false,
    hasWorksInProgress: false,
  },
});

// Only Caribou has its certificate, so the bar's "Certificate issued" toggle
// hides Cariboo Creek - through the real FiltersProvider, which is the only way
// `visibleProjects` actually moves.
const CARIBOU = project(7, "Caribou Gold Project", true);
const CARIBOO = project(8, "Cariboo Creek Project");

// One mock for both: useProjects derives its flat list from useProjectFeatures,
// so the filter bar and the dots on the map read the same two projects. This is
// the unfiltered list - what the filters narrow, and what search matches over.
vi.mock("@/api/useProjects", () => ({
  useProjectFeatures: () => ({
    data: {
      type: "FeatureCollection",
      features: [
        feature(CARIBOU.id, CARIBOU.name),
        feature(CARIBOO.id, CARIBOO.name),
      ],
    },
  }),
  useProjects: () => ({
    projects: [CARIBOU, CARIBOO],
    isPending: false,
    error: null,
    retry: vi.fn(),
  }),
  useProject: () => ({ data: undefined, error: null, isLoading: false }),
}));

vi.mock("@/api/useProjectFilterOptions", () => ({
  useProjectFilterOptions: () => ({
    types: [{ id: 1, name: "Mines" }],
    regions: [{ id: 1, name: "Cariboo" }],
    isPending: false,
    error: null,
    retry: vi.fn(),
  }),
}));

// Places are a different source with its own tests, and an empty answer keeps
// this list to the project rows being walked.
vi.mock("@/api/usePlaceSearch", () => ({
  usePlaceSearch: () => ({ places: [], isLoading: false, error: undefined }),
}));

// The camera is the half of selecting that already worked; this is about the
// panel. Reaches for maplibre's Marker, which the stub above does not implement.
vi.mock("@/components/Search/useSearchMarker", () => ({
  useSearchMarker: () => ({ showAt: vi.fn(), goTo: vi.fn(), clear: vi.fn() }),
}));

// The style and source calls, which a stubbed map has nothing to answer with.
// glyphForType and PROJECTS_LAYER_ID stay real: ProjectsControl computes with
// them before it ever touches the map.
vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showProjects: vi.fn(),
  setSelectedProject: vi.fn(),
  addMissingProjectImage: vi.fn(),
  keepProjectsOnTop: vi.fn(),
  projectIdAt: () => null,
}));

// What the card draws is its own test, and it reaches for the widget's api
// client to draw it. Here it only has to say which project it is for.
vi.mock("@/components/Projects/ProjectCard", () => ({
  default: ({ projectId }: { projectId: number }) => (
    <div data-testid="project-card">{projectId}</div>
  ),
}));

// Drawn over the same map surface and unrelated to this path. Each fetches on
// mount, which is a network call this test has no reason to answer.
vi.mock("@/components/Layers/LayersContext", () => ({
  LayersProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/Layers/LayersControl", () => ({ default: () => null }));
vi.mock("@/components/MetaData/MetaDataControl", () => ({
  default: () => null,
}));

const { MapWidget } = await import("@/widget/MapWidget");

const widget = () => (
  <MapWidget
    apiBaseUrl="https://example.invalid/api"
    getAccessToken={() => Promise.resolve("token")}
  />
);

const field = () => screen.getByRole("combobox");

/** Type into the search field and wait for the project rows to land. */
const search = async (text: string, rows: number) => {
  const user = userEvent.setup();
  await user.clear(field());
  await user.click(field());
  await user.type(field(), text);
  await waitFor(() =>
    expect(screen.getAllByRole("option")).toHaveLength(rows),
  );
  return user;
};

/** The row whose name starts with this, out of the list on screen. */
const row = (name: string) =>
  screen
    .getAllByRole("option")
    .find((option) => option.textContent?.startsWith(name))!;

afterEach(cleanup);

describe("picking a project out of the search", () => {
  it("opens that project's panel", async () => {
    render(widget());
    const user = await search("caribou", 1);

    expect(screen.queryByTestId("project-card")).toBeNull();

    await user.click(row("Caribou Gold Project"));

    expect(screen.getByTestId("project-card").textContent).toBe(
      String(CARIBOU.id),
    );
  });

  // The ticket's second case: zoomed to one project while the panel still
  // described another.
  it("replaces a panel already open with the one just searched", async () => {
    render(widget());
    const first = await search("cari", 2);
    await first.click(row("Caribou Gold Project"));
    expect(screen.getByTestId("project-card").textContent).toBe(
      String(CARIBOU.id),
    );

    const next = await search("cari", 2);
    await next.click(row("Cariboo Creek Project"));

    expect(screen.getAllByTestId("project-card")).toHaveLength(1);
    expect(screen.getByTestId("project-card").textContent).toBe(
      String(CARIBOO.id),
    );
  });

  // A project the filters are hiding has no dot to highlight and gets no panel,
  // but the panel open on another project may not be left behind either.
  // Search matches over the unfiltered list, which is what makes this reachable.
  it("closes the panel for a project the filters are hiding", async () => {
    render(widget());
    const first = await search("cari", 2);
    await first.click(row("Caribou Gold Project"));
    expect(screen.getByTestId("project-card")).toBeDefined();

    // Cariboo Creek has no certificate, so this takes its dot off the map while
    // Caribou keeps both its dot and the open panel.
    await first.click(screen.getByRole("button", { name: "Certificate issued" }));
    expect(screen.getByTestId("project-card").textContent).toBe(
      String(CARIBOU.id),
    );

    const next = await search("cariboo", 1);
    await next.click(row("Cariboo Creek Project"));

    expect(screen.queryByTestId("project-card")).toBeNull();
  });
});
