// @vitest-environment jsdom
//
// The path from the filter bar to what the map draws, end to end through the
// components rather than helper by helper.
//
// The helpers each had their own tests and the wiring between them had none, so
// three separate breaks left the whole suite green: the hook forced to return
// nothing, the apply call dropped from HostedLayer, and the footprint click
// fallback removed from ProjectsControl. Any of the first two draws every EAO
// feature - filtered-out projects and the components no panel has revealed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import type { MapProject } from "@/components/Filters/filterUtils";
import type { ProjectFeatures } from "@/api/useProjects";
import {
  RevealedComponentsProvider,
  useRevealedComponents,
} from "@/components/Projects/RevealedComponentsContext";
import { EAO_OBJECT_NAME, localLayerId, PIP_OBJECT_NAME } from "@/utils/localLayers";

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

/** What the filter bar is reporting, and what a click lands on. */
const state: { visible: MapProject[]; hit: number | null } = {
  visible: [],
  hit: null,
};

const style = {
  source: { minZoom: null, maxZoom: 12 },
  layers: [
    { id: "footprint-fill", type: "fill", sourceLayer: "eao", paint: {} },
    { id: "footprint-outline", type: "line", sourceLayer: "eao", paint: {} },
    { id: "component-fill", type: "fill", sourceLayer: "eao", paint: {} },
    { id: "line", type: "line", sourceLayer: "eao", paint: {} },
    { id: "point", type: "circle", sourceLayer: "eao", paint: {} },
  ],
};

const setLocalVectorLayerFilters = vi.fn();
const showLocalVectorLayer = vi.fn();
const showLocalHighlight = vi.fn();

vi.mock("@/components/Layers/layerUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showLocalVectorLayer,
  setLocalVectorLayerFilters,
  showLocalHighlight,
  hideHighlight: vi.fn(),
  setLocalVectorLayerOpacity: vi.fn(),
  hideLocalVectorLayer: vi.fn(),
}));

vi.mock("@/api/useLocalLayerStyle", () => ({
  useLocalLayerStyle: (objectName: string | null) => ({
    data: objectName === null ? undefined : style,
  }),
  useLocalLayerFloors: () => ({}),
}));

// Only footprintTrackIdAt is replaced: eaoSpecFilters stays real, because the
// tests above are about what it computes.
vi.mock("@/components/Layers/eaoVisibility", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  footprintTrackIdAt: () => state.hit,
}));

// No dot under the pointer, so the boundary is what answers. The drawing
// helpers want a real GL context, which jsdom cannot give.
vi.mock("@/components/Projects/projectUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  projectIdAt: () => null,
  showProjects: vi.fn(),
  setSelectedProject: vi.fn(),
  addMissingProjectImage: vi.fn(),
  keepProjectsOnTop: vi.fn(),
}));

vi.mock("@/api/useProjects", () => ({
  useProjectFeatures: () => ({
    data: { type: "FeatureCollection", features: [] } as ProjectFeatures,
  }),
  useProject: () => ({ data: undefined, error: null, isLoading: false }),
}));

vi.mock("@/widget/MapWidgetContext", () => ({
  useMapWidget: () => ({ apiBaseUrl: "http://localhost/api", api: {} }),
}));

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ visibleProjects: state.visible }),
  useOptionalFilters: () => ({ visibleProjects: state.visible }),
}));

// Nothing here is switched on from the panel, which is the point: the EAO layer
// has no row in it.
vi.mock("@/components/Layers/LayersContext", () => ({
  useLayers: () => ({
    map: {},
    visibleIds: new Set<string>(),
    opacities: {},
    lineWidths: {},
  }),
}));

const { default: HostedLayer } = await import(
  "@/components/Layers/HostedLayer"
);
const { default: ProjectsControl } = await import(
  "@/components/Projects/ProjectsControl"
);

const fakeMap = () => ({
  isStyleLoaded: () => true,
  getLayer: (id: string) => ({ id }),
  getSource: () => ({}),
  getStyle: () => ({ layers: [] }),
  setFilter: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  // revealBesideCard pans the dot clear of the card.
  project: () => ({ x: 10, y: 10 }),
  getContainer: () => ({ clientWidth: 1200 }),
  panBy: vi.fn(),
});

/** Stands in for the project panel, which reveals its components this way. */
const RevealFeatures = ({ ids }: { ids: string[] }) => {
  const { setFeatureIds } = useRevealedComponents();
  useEffect(() => setFeatureIds(ids), [ids, setFeatureIds]);
  return null;
};

/** Stands in for the project panel selecting a component. */
const SelectFeatures = ({ ids }: { ids: string[] }) => {
  const { setSelectedFeatureIds } = useRevealedComponents();
  useEffect(() => setSelectedFeatureIds(ids), [ids, setSelectedFeatureIds]);
  return null;
};

/** The filter the footprint specs were given on the last apply. */
const appliedTo = (specId: string) => {
  const last = setLocalVectorLayerFilters.mock.calls.at(-1);
  return (last?.[3] as Record<string, unknown>)?.[specId];
};

beforeEach(() => {
  setLocalVectorLayerFilters.mockClear();
  showLocalVectorLayer.mockClear();
  showLocalHighlight.mockClear();
  state.visible = [project(205), project(368)];
  state.hit = null;
});
afterEach(cleanup);

describe("the filter bar reaching the footprints", () => {
  it("narrows the footprints to the projects the filters leave visible", () => {
    render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    // The apply call is the wiring: without it the layer draws unnarrowed.
    expect(setLocalVectorLayerFilters).toHaveBeenCalled();
    expect(appliedTo("footprint-fill")).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", [205, 368]],
    ]);
    expect(appliedTo("footprint-outline")).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", [205, 368]],
    ]);
  });

  it("follows the filters when they change", () => {
    const view = render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    state.visible = [project(205)];
    view.rerender(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    expect(appliedTo("footprint-fill")).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", [205]],
    ]);
  });

  it("draws nothing where the filters match no project", () => {
    state.visible = [];

    render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    expect(appliedTo("footprint-fill")).toEqual([
      "in",
      ["get", "track_id"],
      ["literal", []],
    ]);
  });

  it("keeps the components hidden and still bound to their project", () => {
    render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    for (const specId of ["component-fill", "line", "point"]) {
      expect(appliedTo(specId)).toEqual([
        "all",
        ["in", ["get", "track_id"], ["literal", [205, 368]]],
        ["in", ["get", "feature_id"], ["literal", []]],
      ]);
    }
  });

  it("draws the components the project panel reveals", () => {
    render(
      <RevealedComponentsProvider>
        <RevealFeatures ids={["{A1}"]} />
        <HostedLayer objectName={EAO_OBJECT_NAME} />
      </RevealedComponentsProvider>,
    );

    expect(appliedTo("point")).toContainEqual([
      "in",
      ["get", "feature_id"],
      ["literal", ["{A1}"]],
    ]);
  });

  it("highlights the component the project panel selects", () => {
    render(
      <RevealedComponentsProvider>
        <SelectFeatures ids={["{A1}", "{A2}"]} />
        <HostedLayer objectName={EAO_OBJECT_NAME} />
      </RevealedComponentsProvider>,
    );

    expect(showLocalHighlight).toHaveBeenLastCalledWith(expect.anything(), {
      layerId: localLayerId(EAO_OBJECT_NAME),
      sourceLayer: "eao",
      keyProperty: "feature_id",
      keys: ["{A1}", "{A2}"],
    });
  });

  it("highlights nothing while no component is selected", () => {
    render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    expect(showLocalHighlight).not.toHaveBeenCalled();
  });

  it("is drawn without being switched on in the panel", () => {
    // visibleIds is empty above: an always-drawn layer ignores it.
    render(<HostedLayer objectName={EAO_OBJECT_NAME} />);

    expect(showLocalVectorLayer).toHaveBeenCalled();
    expect(showLocalVectorLayer.mock.calls[0][1]).toBe(
      localLayerId(EAO_OBJECT_NAME),
    );
  });

  it("narrows nothing on a layer the panel owns", () => {
    render(<HostedLayer objectName={PIP_OBJECT_NAME} />);

    // PIP is not in visibleIds, so it is not drawn and nothing is applied.
    expect(showLocalVectorLayer).not.toHaveBeenCalled();
  });
});

describe("clicking a footprint opens its project", () => {
  it("selects the project under the boundary when no dot was hit", () => {
    state.hit = 205;
    const onSelect = vi.fn();
    const map = fakeMap();

    render(
      <ProjectsControl map={map as never} selectedId={null} onSelect={onSelect} />,
    );

    const click = map.on.mock.calls.find((call) => call[0] === "click");
    expect(click).toBeDefined();
    (click![1] as (event: unknown) => void)({
      point: { x: 1, y: 1 },
      lngLat: { lng: -123, lat: 50 },
    });

    expect(onSelect).toHaveBeenCalledWith(205);
  });

  it("selects nothing where neither a dot nor a boundary was hit", () => {
    state.hit = null;
    const onSelect = vi.fn();
    const map = fakeMap();

    render(
      <ProjectsControl map={map as never} selectedId={null} onSelect={onSelect} />,
    );

    const click = map.on.mock.calls.find((call) => call[0] === "click");
    (click![1] as (event: unknown) => void)({
      point: { x: 1, y: 1 },
      lngLat: { lng: -123, lat: 50 },
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
