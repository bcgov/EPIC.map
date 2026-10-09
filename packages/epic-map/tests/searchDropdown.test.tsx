// @vitest-environment jsdom
//
// The only jsdom file in this package. Everything else here is pure logic over
// exported functions, which needs no DOM — but grouping, the states that overlap
// and the keyboard are all things a reader can only check by rendering.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchDropdown from "@/components/Search/SearchDropdown";
import {
  toRows,
  type PlaceResult,
  type ProjectResult,
} from "@/components/Search/searchUtils";

afterEach(cleanup);

const project = (name: string, type: string | null = "Water Management"): ProjectResult => ({
  id: name.length,
  name,
  type,
  coordinates: [-123, 50],
  zoom: 11,
});

const place = (
  name: string,
  pill: string | null,
  locality: string | null,
): PlaceResult => ({
  id: `place-${name}`,
  name,
  pill,
  locality,
  coordinates: [-123, 50],
  zoom: 12,
});

const renderDropdown = ({
  projects = [] as ProjectResult[],
  places = [] as PlaceResult[],
  query = "car",
  activeIndex = -1,
  loading = false,
  onSelect = vi.fn(),
} = {}) => {
  const result = render(
    <SearchDropdown
      listId="search"
      query={query}
      projects={projects}
      places={places}
      rows={toRows(projects, places)}
      activeIndex={activeIndex}
      loading={loading}
      onSelect={onSelect}
    />,
  );
  return { ...result, onSelect };
};

describe("grouping", () => {
  it("heads each group that has matches", () => {
    renderDropdown({
      projects: [project("Caribou Gold Project")],
      places: [place("Carmi", "City", null)],
    });

    expect(screen.getByText("EAO Projects")).toBeDefined();
    expect(screen.getByText("Places")).toBeDefined();
  });

  it("does not head a group with no matches", () => {
    renderDropdown({ places: [place("Carmi", "City", null)] });

    expect(screen.queryByText("EAO Projects")).toBeNull();
    expect(screen.getByText("Places")).toBeDefined();
  });

  // The rule divides two sections; with only one there is nothing to divide.
  // Read through getComputedStyle because `sx` compiles to an emotion class
  // rather than an inline style.
  it("separates the second section only when there is a first", () => {
    const { unmount } = renderDropdown({
      projects: [project("Caribou Gold Project")],
      places: [place("Carmi", "City", null)],
    });
    expect(
      getComputedStyle(screen.getByText("Places")).borderTopStyle,
    ).toBe("solid");

    unmount();
    renderDropdown({ places: [place("Carmi", "City", null)] });
    expect(
      getComputedStyle(screen.getByText("Places")).borderTopStyle,
    ).not.toBe("solid");
  });
});

describe("rows", () => {
  it("shows a project's type beneath its name, with the match in bold", () => {
    renderDropdown({ projects: [project("Caribou Gold Project")] });

    const row = screen.getByRole("option");
    expect(within(row).getByText("Water Management")).toBeDefined();
    // "car" of "Caribou", in the text's own casing.
    expect(within(row).getByText("Car").tagName).toBe("STRONG");
  });

  it("shows a pill and the locality beside it for an address", () => {
    renderDropdown({
      places: [place("Carmanah Main FSR", "City", "Qualicum Beach")],
    });

    const row = screen.getByRole("option");
    expect(within(row).getByText("City")).toBeDefined();
    expect(within(row).getByText("Qualicum Beach")).toBeDefined();
  });

  it("does not repeat a bare locality's name beside its pill", () => {
    renderDropdown({ places: [place("Carmi", "City", null)] });

    // The whole row, with the name appearing once and the pill after it.
    expect(screen.getByRole("option").textContent).toBe("CarmiCity");
  });

  it("draws no pill at all for a place that classifies itself as nothing", () => {
    renderDropdown({ places: [place("Somewhere", null, null)] });

    const row = screen.getByRole("option");
    expect(within(row).queryByText("Unknown")).toBeNull();
    expect(row.textContent).toBe("Somewhere");
  });

  it("selects the row that was clicked", async () => {
    const { onSelect } = renderDropdown({
      projects: [project("Caribou Gold Project")],
      places: [place("Carmi", "City", null)],
    });

    await userEvent.click(screen.getAllByRole("option")[1]);

    expect(onSelect).toHaveBeenCalledWith({
      kind: "place",
      place: expect.objectContaining({ name: "Carmi" }),
    });
  });
});

describe("states", () => {
  // Projects are local and arrive first; the geocoder is still answering.
  it("lists project matches above the spinner while places load", () => {
    renderDropdown({
      projects: [project("Caribou Gold Project")],
      loading: true,
    });

    expect(screen.getByRole("option").textContent).toBe(
      "Caribou Gold ProjectWater Management",
    );
    expect(screen.getByText("Searching")).toBeDefined();
    expect(screen.queryByText(/No projects or places match/)).toBeNull();
  });

  it("says nothing matched once the search has settled with nothing", () => {
    renderDropdown({ query: "tmo", loading: false });

    expect(screen.getByText('No projects or places match “tmo”')).toBeDefined();
    expect(
      screen.getByText("Check the spelling or try a shorter term"),
    ).toBeDefined();
  });

  // Announcing "no match" over a request still in flight would be wrong, not
  // merely early.
  it("does not say nothing matched while still searching", () => {
    renderDropdown({ query: "tmo", loading: true });

    expect(screen.queryByText(/No projects or places match/)).toBeNull();
    expect(screen.getByText("Searching")).toBeDefined();
  });
});

describe("the active row", () => {
  it("marks the active row and only that row", () => {
    renderDropdown({
      projects: [project("Caribou Gold Project")],
      places: [place("Carmi", "City", null)],
      activeIndex: 1,
    });

    const [first, second] = screen.getAllByRole("option");
    expect(first.getAttribute("aria-selected")).toBe("false");
    expect(second.getAttribute("aria-selected")).toBe("true");
  });

  // What `aria-activedescendant` on the field points at, so the ids have to be
  // the flat index across both groups rather than per-group.
  it("ids rows by their position across both groups", () => {
    renderDropdown({
      projects: [project("Caribou Gold Project")],
      places: [place("Carmi", "City", null)],
    });

    expect(screen.getAllByRole("option").map((row) => row.id)).toEqual([
      "search-row-0",
      "search-row-1",
    ]);
  });

  it("offers no listbox when there is nothing to choose from", () => {
    renderDropdown({ query: "tmo" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
