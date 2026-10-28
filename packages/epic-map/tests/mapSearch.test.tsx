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
import { PROJECT_CARD_WIDTH_PX } from "@/utils/config";

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

const goTo = vi.fn();
const clearMarker = vi.fn();

/** Stands in for the widget's project selection, which owns the panel. */
const onProjectSelect = vi.fn();

// The marker is mocked rather than exercised: it is the one part of this
// component that reaches for maplibre, which wants a WebGL context jsdom has
// no way to give it.
vi.mock("@/components/Search/useSearchMarker", () => ({
  useSearchMarker: () => ({ showAt, goTo, clear: clearMarker }),
}));

const caribou = {
  id: 1,
  name: "Caribou Gold Project",
  latitude: 53,
  longitude: -122,
  typeId: 1,
  regionId: null,
  certificateIssued: false,
  inProgressWorks: false,
};

/** Whether the filters are currently letting the project through to the map. */
const filterState = { visible: [caribou] as (typeof caribou)[] };

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({
    projects: [caribou],
    visibleProjects: filterState.visible,
    types: [{ id: 1, name: "Mines" }],
  }),
}));

/**
 * What the geocoder answers with, so a test can change it or fail it.
 *
 * Still keyed on the query, because the debounce is real here: the hook is
 * asked with the debounced string, so an empty one is the window in which
 * projects are listed and places are not.
 */
const placeSearch: {
  results: PlaceResult[];
  isLoading: boolean;
  error: unknown;
} = { results: places, isLoading: false, error: undefined };

vi.mock("@/api/usePlaceSearch", () => ({
  usePlaceSearch: (query: string) => ({
    places: query.trim() ? placeSearch.results : [],
    isLoading: placeSearch.isLoading,
    error: placeSearch.error,
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

beforeEach(() => {
  showAt.mockClear();
  goTo.mockClear();
  clearMarker.mockClear();
  onProjectSelect.mockClear();
  filterState.visible = [caribou];
  placeSearch.results = places;
  placeSearch.isLoading = false;
  placeSearch.error = undefined;
});
afterEach(cleanup);

describe("the field", () => {
  it("starts empty, with the placeholder and no dropdown", () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);

    expect(field().getAttribute("placeholder")).toBe(
      "Search projects and places…",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByLabelText("Clear search")).toBeNull();
  });

  // map-web's federation test reaches for the remote's own chrome with
  // `input[role="combobox"]`, having previously matched on the placeholder's
  // wording and broken on a copy edit. Pinned here so that seam cannot be cut
  // from this side without a failure that says why.
  it("carries the role map-web's federation test selects on", () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);

    expect(field().getAttribute("role")).toBe("combobox");
  });

  it("offers a clear button once it has a value", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    await search("car");

    expect(screen.getByLabelText("Clear search")).toBeDefined();
  });

  // Saying "no places match" after one character would be a claim about a
  // search that was never run.
  it("stays shut below the length the geocoder is asked at", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "c");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText(/No projects or places match/)).toBeNull();
  });

  it("empties the field and closes the dropdown when cleared", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");
    expect(screen.getByRole("listbox")).toBeDefined();

    await user.click(screen.getByLabelText("Clear search"));

    expect((field() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("the keyboard", () => {
  it("walks the rows with Down, across both groups", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
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
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.keyboard("{ArrowDown}{ArrowUp}");

    expect(field().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("wraps from the last row round to the first", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    // Three rows: one project, two places.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

    expect(field().getAttribute("aria-activedescendant")).toMatch(/row-0$/);
  });

  it("selects the active row on Enter and closes the dropdown", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    // Past the one project, onto the first place.
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(showAt).toHaveBeenCalledWith([-119, 49.4], 11);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does nothing on Enter with no row active", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.keyboard("{Enter}");

    expect(showAt).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("closes on Escape without clearing what was typed", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect((field() as HTMLInputElement).value).toBe("car");
  });

  it("reopens on an arrow key after Escape", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
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
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[1]);

    expect((field() as HTMLInputElement).value).toBe("car");
  });

  it("flies to a place at the zoom its precision implies", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[2]);

    expect(showAt).toHaveBeenCalledWith([-124.7, 48.7], 14);
  });

  // A project is already a dot carrying its own glyph and colour, so a pin
  // beside it would be a second symbol for one thing.
  it("flies to a project's own coordinate without pinning it", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(goTo).toHaveBeenCalledWith(
      [-122, 53],
      expect.any(Number),
      expect.any(Array),
    );
    expect(showAt).not.toHaveBeenCalled();
  });

  // The gap this closes: the camera went, the panel stayed behind.
  it("opens the chosen project's panel", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(onProjectSelect).toHaveBeenCalledWith(caribou.id);
  });

  it("opens it on Enter as well as on a click", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    // The project is the first row.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onProjectSelect).toHaveBeenCalledWith(caribou.id);
  });

  // The panel docks over the right edge, so centring in the whole container
  // would put the dot it just flew to underneath the panel it just opened.
  it("leaves room for the panel it opens", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(goTo).toHaveBeenCalledWith([-122, 53], expect.any(Number), [
      -PROJECT_CARD_WIDTH_PX / 2,
      0,
    ]);
  });

  // A place is not a project, so it says nothing about which panel is open.
  it("leaves the panel alone when a place is picked", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[1]);

    expect(onProjectSelect).not.toHaveBeenCalled();
  });

  // No panel for a project the map is not drawing, but not a stale one either.
  it("closes the panel rather than opening one for a hidden project", async () => {
    filterState.visible = [];
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(onProjectSelect).toHaveBeenCalledWith(null);
  });

  /**
   * Projects are searched over the whole list, not the filtered subset, so a
   * chosen project may be one the map is not drawing. Then there is no dot to
   * identify it and the pin is all there is.
   */
  it("pins a project the filters are hiding", async () => {
    filterState.visible = [];
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[0]);

    expect(showAt).toHaveBeenCalledWith([-122, 53], expect.any(Number));
    expect(goTo).not.toHaveBeenCalled();
  });

  // Otherwise the field would be showing two answers at once: a pin on the
  // place picked before, and the project it has just flown to.
  it("takes down a place's pin when a project is picked next", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    await user.click(screen.getAllByRole("option")[1]);
    expect(showAt).toHaveBeenCalled();

    // Reopened with a key rather than a click: the menu keeps focus in the
    // field, so clicking it again fires no onFocus to open it with.
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getAllByRole("option")).toHaveLength(ROWS),
    );
    await user.click(screen.getAllByRole("option")[0]);

    expect(goTo).toHaveBeenCalledWith(
      [-122, 53],
      expect.any(Number),
      expect.any(Array),
    );
  });
});

describe("the active row across an update", () => {
  /**
   * The bug this pins: the places are debounced, so they land under a list the
   * user may already be walking. Holding the active row by position lost the
   * highlight the moment they did, and Enter then did nothing.
   */
  it("keeps the highlighted project when the places arrive beneath it", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "car");

    // The project half only: the geocoder has not been asked yet.
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}");
    const highlighted = screen.getByRole("option").getAttribute("id");
    expect(field().getAttribute("aria-activedescendant")).toBe(highlighted);

    // The places land, adding two rows below the highlighted one.
    await waitFor(() =>
      expect(screen.getAllByRole("option")).toHaveLength(ROWS),
    );

    const [project] = screen.getAllByRole("option");
    expect(project.getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(
      project.getAttribute("id"),
    );

    await user.keyboard("{Enter}");
    expect(goTo).toHaveBeenCalledWith(
      [-122, 53],
      expect.any(Number),
      expect.any(Array),
    );
  });

  /**
   * And the other half of it: as many rows as before, but not the same rows.
   * Keeping the position would leave the highlight on a row the user never
   * chose, so Enter would take that one.
   */
  it("drops the highlight when the row it was on is replaced", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");

    // Past the project match, onto the first place.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe(
      "true",
    );

    // The next keystroke returns as many places, but different ones.
    placeSearch.results = [
      { ...places[0], name: "Cariboo Road" },
      { ...places[1], name: "Cariboo Lake" },
    ];
    await user.type(field(), "i");
    // Matched against the row's whole text: the query's prefix is drawn in its
    // own <strong>, so the name is split across elements.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("option")
          .some((row) => row.textContent?.startsWith("Cariboo Road")),
      ).toBe(true),
    );

    expect(screen.getAllByRole("option")).toHaveLength(ROWS);
    expect(
      screen
        .getAllByRole("option")
        .some((row) => row.getAttribute("aria-selected") === "true"),
    ).toBe(false);
    expect(field().getAttribute("aria-activedescendant")).toBeNull();

    await user.keyboard("{Enter}");
    expect(showAt).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });
});

describe("clearing", () => {
  // The pin answers the query being cleared, and nothing else on screen can
  // remove it.
  it("takes the pin off the map", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = await search("car");
    // A place, so that there is a pin to take off.
    await user.click(screen.getAllByRole("option")[1]);
    expect(showAt).toHaveBeenCalled();

    await user.click(screen.getByLabelText("Clear search"));

    expect(clearMarker).toHaveBeenCalled();
  });
});

describe("when the geocoder does not answer", () => {
  /**
   * A failed request is not an empty result. Reporting it as one tells the user
   * their spelling is wrong about a search that never came back.
   */
  it("says the places search failed rather than that nothing matched", async () => {
    placeSearch.results = [];
    placeSearch.error = new Error("geocoder unreachable");
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "zzz");

    await waitFor(() =>
      expect(screen.getByText("Places could not be searched")).toBeDefined(),
    );
    expect(screen.queryByText(/No projects or places match/)).toBeNull();
  });

  // Projects are matched in the browser, so they are unaffected.
  it("still lists the projects that matched", async () => {
    placeSearch.results = [];
    placeSearch.error = new Error("geocoder unreachable");
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "car");

    await waitFor(() =>
      expect(screen.getByText("Places could not be searched")).toBeDefined(),
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});

describe("the combobox contract", () => {
  // aria-controls must name an element that exists; the no-results state is a
  // status message, not a listbox.
  it("names no listbox when none is rendered", async () => {
    placeSearch.results = [];
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.type(field(), "zzz");

    await waitFor(() =>
      expect(screen.getByText(/No projects or places match/)).toBeDefined(),
    );

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().getAttribute("aria-controls")).toBeNull();
  });

  it("names the listbox while one is rendered", async () => {
    render(<MapSearch map={null} onProjectSelect={onProjectSelect} />);
    await search("car");

    expect(field().getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").getAttribute("id"),
    );
  });
});
