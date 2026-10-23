// @vitest-environment jsdom
//
// Which slider an expanded layer gets, and what it drives. Per layer: the
// warehouse case below is what holds every other slider still.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { PIP_OBJECT_NAME, localLayerId } from "@/utils/localLayers";

const setOpacity = vi.fn();
const setLineWidth = vi.fn();
const state = { lineWidths: {} as Record<string, number> };

vi.mock("@/components/Layers/LayersContext", () => ({
  useLayers: () => ({
    opacities: {},
    setOpacity,
    lineWidths: state.lineWidths,
    setLineWidth,
  }),
}));

// A date is a request; this file is about the slider above it.
vi.mock("@/api/useLocalLayerInfo", () => ({
  useLocalLayerInfo: () => ({ data: undefined }),
}));

const { default: LayerInfo } = await import(
  "@/components/Layers/LayerInfo"
);

const pip = {
  id: localLayerId(PIP_OBJECT_NAME),
  objectName: PIP_OBJECT_NAME,
} as CatalogueLayer;

const warehouse = {
  id: "applied-1",
  objectName: "WHSE_TEST.A_LAYER",
} as CatalogueLayer;

const slider = () => screen.getByRole("slider");

afterEach(() => {
  cleanup();
  setOpacity.mockClear();
  setLineWidth.mockClear();
  state.lineWidths = {};
});

describe("the PIP layer's adjustment slider", () => {
  it("is labelled a line width and reads in pixels", () => {
    render(<LayerInfo layer={pip} />);

    expect(screen.getByText("Line width")).toBeTruthy();
    // The width the .lyrx already strokes, so the layer looks unchanged.
    expect(screen.getByText("4.0 px")).toBeTruthy();
    expect(screen.queryByText("Opacity")).toBeNull();
  });

  it("shows the width that is set rather than the default", () => {
    state.lineWidths = { [pip.id]: 1.5 };
    render(<LayerInfo layer={pip} />);

    expect(screen.getByText("1.5 px")).toBeTruthy();
    expect(slider().getAttribute("value")).toBe("1.5");
  });

  it("sets the width as the slider moves, and never the opacity", () => {
    render(<LayerInfo layer={pip} />);

    // The change event a drag emits, not the one the drop does.
    fireEvent.change(slider(), { target: { value: "1.5" } });

    expect(setLineWidth).toHaveBeenCalledWith(pip.id, 1.5);
    expect(setOpacity).not.toHaveBeenCalled();
  });

  it("runs between a hairline and six pixels", () => {
    render(<LayerInfo layer={pip} />);

    // Floored above zero: an end that erases the layer reads as a bug.
    expect(slider().getAttribute("min")).toBe("0.3");
    expect(slider().getAttribute("max")).toBe("6");
    // One decimal, matching the px the label shows.
    expect(slider().getAttribute("step")).toBe("0.1");
  });

  it("puts both ends on the step grid, so a drag can reach them", () => {
    render(<LayerInfo layer={pip} />);

    // MUI rounds to `min + n * step`, so a floor off that grid is unreachable
    // and the values either side of it are picked twice.
    const min = Number(slider().getAttribute("min"));
    const max = Number(slider().getAttribute("max"));
    const step = Number(slider().getAttribute("step"));

    // Counted in steps rather than by modulo, which 5.7 % 0.1 fails in binary.
    const steps = (span: number) => Math.round((span / step) * 1e6) / 1e6;

    expect(Number.isInteger(steps(min))).toBe(true);
    expect(Number.isInteger(steps(max - min))).toBe(true);
  });
});

describe("every other layer's adjustment slider", () => {
  it("is still an opacity in percent", () => {
    render(<LayerInfo layer={warehouse} />);

    expect(screen.getByText("Opacity")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(slider().getAttribute("max")).toBe("100");

    fireEvent.change(slider(), { target: { value: "40" } });

    expect(setOpacity).toHaveBeenCalledWith(warehouse.id, 40);
    expect(setLineWidth).not.toHaveBeenCalled();
  });
});
