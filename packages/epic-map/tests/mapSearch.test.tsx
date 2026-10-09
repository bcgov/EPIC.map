// @vitest-environment jsdom
//
// The field's own behaviour: what opens and closes the dropdown, and what the
// arrow keys, Enter and Escape do to it. `steppedIndex` is unit-tested beside
// the rest of the logic; this is the wiring around it, which is where a
// keyboard-navigable list actually succeeds or fails.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlaceResult } from "@/components/Search/searchUtils";

const showAt = vi.fn();
const places: PlaceResult[] = [
  {
    id: "place-0",
    name: "Carmi",
    pill: "City",
    locality: null,
    coordinates: [-119, 49.4],
    zoom: 11,
  },
  {
    id: "place-1",
    name: "Carmanah Main FSR",
    pill: "Street",
    locality: "Ditidaht",
    coordinates: [-124.7, 48.7],
    zoom: 14,
  },
];

// The marker is mocked rather than exercised: it is the one part of this
// component that reaches for maplibre, which wants a WebGL context jsdom has
// no way to give it.
vi.mock("@/components/Search/useSearchMarker", () => ({
  useSearchMarker: () => ({ showAt, clear: vi.fn() }),
}));

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({
    projects: [
      {
        id: 1,
        name: "Caribou Gold Project",
        latitude: 53,
        longitude: -122,
        typeId: 1,
        regionId: null,
        certificateIssued: false,
        inProgressWorks: false,
        isClosed: false,
      },
    ],
    types: [{ id: 1, name: "Mines" }],
  }),
}));

vi.mock("@/api/usePlaceSearch", () => ({
  usePlaceSearch: (query: string) => ({
    places: query.trim() ? places : [],
    isLoading: false,
  }),
}));

const { default: MapSearch } = await import("@/components/Search/MapSearch");

const field = () => screen.getByRole("combobox");

/**
 * Type into the field and wait for both halves of the list to land.
 *
 * The project half is local and appears on the keystroke; the place half is
 * debounced and follows ~400ms later. Waiting for all three rows is what makes
 * the row indices below mean anything — pressing Down before the places arrive
 * walks a one-row list, and the list changing under an active row resets it.
 */
const ROWS = 3;

const search = async (text: string) => {
  const user = userEvent.setup();
  await user.click(field());
  await user.type(field(), text);
  await waitFor(() =>
    expect(screen.getAllByRole("option")).toHaveLength(ROWS),
  );
  return user;
};

beforeEach(() => showAt.mockClear());
afterEach(cleanup);

describe("the field", () => {
  it("starts empty, with the placeholder and no dropdown", () => {
    render(<MapSearch map={null} />);

    expect(field().getAttribute("placeholder")).toBe(
      "Search projects and places…",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByLabelText("Clear search")).toBeNull();
  });

  it("offers a clear button once it has a value", async () => {
    render(<MapSearch map={null} />);
    await search("car");

    expect(screen.getByLabelText("Clear search")).toBeDefined();
  });

  // Saying "no places match" after one character would be a claim about a
  // search that was never run.
  it("stays shut below the length the geocoder is asked at", async () => {
    render(<MapSearch map={null} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "c");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText(/No projects or places match/)).toBeNull();
  });

  it("empties the field and closes the dropdown when cleared", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");
    expect(screen.getByRole("listbox")).toBeDefined();

    await user.click(screen.getByLabelText("Clear search"));

    expect((field() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("the keyboard", () => {
  it("walks the rows with Down, across both groups", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    // Projects first, then places: one project and two places here.
    expect(field().getAttribute("aria-activedescendant")).toBeNull();

    await user.keyboard("{ArrowDown}");
    const first = field().getAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    const second = field().getAttribute("aria-activedescendant");

    expect(first).toMatch(/row-0$/);
    expect(second).toMatch(/row-1$/);
  });

  it("returns to the input above the first row", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.keyboard("{ArrowDown}{ArrowUp}");

    expect(field().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("wraps from the last row round to the first", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    // Three rows: one project, two places.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

    expect(field().getAttribute("aria-activedescendant")).toMatch(/row-0$/);
  });

  it("selects the active row on Enter and closes the dropdown", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    // Past the one project, onto the first place.
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(showAt).toHaveBeenCalledWith([-119, 49.4], 11);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does nothing on Enter with no row active", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.keyboard("{Enter}");

    expect(showAt).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("closes on Escape without clearing what was typed", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect((field() as HTMLInputElement).value).toBe("car");
  });

  it("reopens on an arrow key after Escape", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("listbox")).toBeDefined();
  });
});

describe("selecting", () => {
  // The query is the user's, and "Douglas St" matching four cities is exactly
  // when replacing it would cost them the other three.
  it("keeps the typed query rather than the chosen result's name", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[1]);

    expect((field() as HTMLInputElement).value).toBe("car");
  });

  it("flies to a place at the zoom its precision implies", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[2]);

    expect(showAt).toHaveBeenCalledWith([-124.7, 48.7], 14);
  });

  it("flies to a project's own coordinate", async () => {
    render(<MapSearch map={null} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(showAt).toHaveBeenCalledWith([-122, 53], expect.any(Number));
  });
});
