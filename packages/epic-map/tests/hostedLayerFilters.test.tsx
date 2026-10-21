// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { LocalLayerStyle } from "@/components/Layers/layerUtils";
import { useHostedLayerFilters } from "@/components/Layers/useHostedLayerFilters";
import { EAO_OBJECT_NAME, PIP_OBJECT_NAME } from "@/utils/localLayers";

// The hook reads the filter bar, which in the widget is always mounted above
// it. Mocked rather than provided, so this stays a test of the hook.
const VISIBLE = [{ id: 205 }];
vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ visibleProjects: VISIBLE }),
}));

/** Which hosted layers narrow themselves, and which are left whole. */

const style: LocalLayerStyle = {
  source: { minZoom: null, maxZoom: 12 },
  layers: [
    {
      id: "footprint-fill",
      type: "fill",
      sourceLayer: "eao_project_data",
      paint: {},
    },
    { id: "line", type: "line", sourceLayer: "eao_project_data", paint: {} },
  ],
};

describe("the filters a hosted layer adds to its style", () => {
  it("adds nothing for a layer that draws all of itself", () => {
    const { result } = renderHook(() =>
      useHostedLayerFilters(PIP_OBJECT_NAME, style),
    );

    expect(result.current).toEqual({});
  });

  it("adds nothing before the style has arrived", () => {
    const { result } = renderHook(() =>
      useHostedLayerFilters(EAO_OBJECT_NAME, undefined),
    );

    expect(result.current).toEqual({});
  });

  it("narrows the layer the filters own", () => {
    const { result } = renderHook(() =>
      useHostedLayerFilters(EAO_OBJECT_NAME, style),
    );

    expect(Object.keys(result.current)).toEqual([
      "footprint-fill",
      "footprint-outline",
      "line",
    ]);
  });
});
