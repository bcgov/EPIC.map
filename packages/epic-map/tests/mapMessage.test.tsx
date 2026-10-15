// @vitest-environment jsdom
//
// The rule that decides which words explain an empty map, and that only one set
// of them is ever on screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const clearFilters = vi.fn();
const retryProjects = vi.fn();

const filters = { noMatches: false, loadFailed: false };

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({ ...filters, clearFilters, retryProjects }),
}));

const { default: MapMessage } = await import(
  "@/components/Filters/MapMessage"
);

beforeEach(() => {
  clearFilters.mockClear();
  retryProjects.mockClear();
  filters.noMatches = false;
  filters.loadFailed = false;
});
afterEach(cleanup);

describe("which message is shown", () => {
  it("says nothing while the map has something to show", () => {
    render(<MapMessage />);

    expect(screen.queryByText(/No projects match/)).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it("explains a combination that matches nothing, and offers to clear it", async () => {
    filters.noMatches = true;
    render(<MapMessage />);

    expect(screen.getByText("No projects match these filters")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(clearFilters).toHaveBeenCalled();
    expect(retryProjects).not.toHaveBeenCalled();
  });

  /**
   * The gap this closes: the list failing used to leave a blank map with no
   * words at all, because `noMatches` is false whenever there is an error.
   */
  it("explains a list that could not be loaded, and offers a retry", async () => {
    filters.loadFailed = true;
    render(<MapMessage />);

    expect(screen.getByText("Projects could not be loaded")).toBeDefined();
    expect(screen.queryByText(/No projects match/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retryProjects).toHaveBeenCalled();
    expect(clearFilters).not.toHaveBeenCalled();
  });

  // Both cards sit in one live region; two at once would announce twice and
  // give contradictory reasons for the same empty map.
  it("never shows both, even if both rules somehow hold", () => {
    filters.noMatches = true;
    filters.loadFailed = true;
    render(<MapMessage />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button").textContent).toBe("Try again");
  });

  // The region itself stays mounted, so a card arriving is a change to it
  // rather than a new region appearing silently.
  it("keeps one live region whether or not a card is in it", () => {
    const { unmount } = render(<MapMessage />);
    expect(screen.getByRole("status")).toBeDefined();
    unmount();

    filters.loadFailed = true;
    render(<MapMessage />);
    expect(screen.getByRole("status")).toBeDefined();
  });
});
