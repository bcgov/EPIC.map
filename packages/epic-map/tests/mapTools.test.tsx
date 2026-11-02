// @vitest-environment jsdom
//
// The tool bar and the selection Select area builds from map clicks. Hit tests
// need WebGL, so they are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const { default: MapToolsControl } = await import(
  "@/components/MapTools/MapToolsControl"
);
const { SelectAreaProvider } = await import(
  "@/components/MapTools/SelectAreaContext"
);

const INFO = "Click projects or components on the map to add them.";

const BOUNDARY = { featureId: "{F1}", label: "Project Boundary" };
const PUMPHOUSE = { featureId: "{A1}", label: "Proposed Pumphouse" };

const fakeMap = () => ({ on: vi.fn(), off: vi.fn() });
type FakeMap = ReturnType<typeof fakeMap>;

const renderTools = (map: FakeMap | null = null) =>
  render(
    <SelectAreaProvider>
      <MapToolsControl map={map as never} />
    </SelectAreaProvider>,
  );

const selectArea = () => screen.getByRole("button", { name: "Select area" });
const measure = () => screen.getByRole("button", { name: "Measure" });
const rows = () => screen.queryAllByRole("listitem");

/** Clicks the map on whatever `hit` describes. */
const clickMap = (map: FakeMap, feature: typeof hit.feature, dot = false) => {
  hit.feature = feature;
  hit.dot = dot;
  const listening = map.on.mock.calls.filter(
    ([event, handler]) =>
      event === "click" &&
      !map.off.mock.calls.some(([, removed]) => removed === handler),
  );
  act(() => listening.forEach(([, handler]) => handler({ point: { x: 1, y: 1 } })));
};

beforeEach(() => {
  hit.dot = false;
  hit.feature = null;
});
afterEach(cleanup);

describe("map tools", () => {
  it("starts with both tools off and no info card", () => {
    renderTools();

    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(measure().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(INFO)).toBeNull();
  });

  it("shows the info card while Select area is on, and dismisses it when turned off", async () => {
    renderTools();

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe(INFO);

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(INFO)).toBeNull();
  });

  it("keeps the two tools mutually exclusive", async () => {
    renderTools();

    await userEvent.click(selectArea());
    await userEvent.click(measure());
    expect(measure().getAttribute("aria-pressed")).toBe("true");
    expect(selectArea().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(INFO)).toBeNull();

    await userEvent.click(selectArea());
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
    expect(measure().getAttribute("aria-pressed")).toBe("false");
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

    expect(rows().map((row) => row.textContent)).toEqual([
      "Project Boundary",
      "Proposed Pumphouse",
    ]);
    expect(screen.getByRole("heading", { name: "Selected" })).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.queryByText(INFO)).toBeNull();
  });

  it("adds nothing where there is no footprint or component", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());

    clickMap(map, null);

    expect(rows()).toHaveLength(0);
    expect(screen.getByText(INFO)).toBeDefined();
  });

  it("leaves a click on a project dot to the dot", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());

    clickMap(map, BOUNDARY, true);

    expect(rows()).toHaveLength(0);
  });

  it("shows Clear all and What's here once something is selected", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    clickMap(map, BOUNDARY);

    expect(screen.getByRole("button", { name: "Clear all" })).toBeDefined();
    expect(screen.getByRole("button", { name: "What’s here" })).toBeDefined();
  });

  it("toggles a row's highlight by clicking its name", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);
    clickMap(map, PUMPHOUSE);

    const name = screen.getByRole("button", { name: "Proposed Pumphouse" });
    await userEvent.click(name);
    expect(name.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Project Boundary" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    await userEvent.click(name);
    expect(name.getAttribute("aria-pressed")).toBe("false");
  });

  it("removes one row with its ×, and every row with Clear all", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);
    clickMap(map, PUMPHOUSE);

    const [first] = rows();
    await userEvent.click(
      within(first).getByRole("button", { name: "Remove Project Boundary" }),
    );
    expect(rows().map((row) => row.textContent)).toEqual(["Proposed Pumphouse"]);

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(INFO)).toBeDefined();
    expect(selectArea().getAttribute("aria-pressed")).toBe("true");
  });

  it("discards the selection when Select area is turned off", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);

    await userEvent.click(selectArea());
    await userEvent.click(selectArea());

    expect(rows()).toHaveLength(0);
    expect(screen.getByText(INFO)).toBeDefined();
  });

  it("discards the selection when Measure takes over", async () => {
    const map = fakeMap();
    renderTools(map);
    await userEvent.click(selectArea());
    clickMap(map, BOUNDARY);

    await userEvent.click(measure());
    await userEvent.click(selectArea());

    expect(rows()).toHaveLength(0);
  });
});
