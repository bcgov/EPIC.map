// @vitest-environment jsdom
//
// What an open menu says when its code tables did not arrive, and that a menu
// with options in it is left alone.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FilterOption } from "@/components/Filters/filterUtils";
import { NO_FILTERS } from "@/components/Filters/filterUtils";

const retryOptions = vi.fn();
const setGroupSelection = vi.fn();

const context = { optionsFailed: false };

vi.mock("@/components/Filters/FiltersContext", () => ({
  useFilters: () => ({
    projects: [],
    filters: NO_FILTERS,
    setGroupSelection,
    retryOptions,
    ...context,
  }),
}));

const { default: FilterDropdown } = await import(
  "@/components/Filters/FilterDropdown"
);

const types: FilterOption[] = [{ id: 1, name: "Mines" }];

const open = async (options: readonly FilterOption[] = []) => {
  render(
    <FilterDropdown
      label="Type"
      allLabel="All Types"
      group="typeId"
      options={options}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Type/ }));
};

beforeEach(() => {
  retryOptions.mockClear();
  setGroupSelection.mockClear();
  context.optionsFailed = false;
});
afterEach(cleanup);

describe("a menu whose options could not be loaded", () => {
  /**
   * The gap this closes: a failed fetch used to leave "All Types" above no
   * types, which reads as a working menu over an empty project list.
   */
  it("says so in place of its rows, and offers a retry", async () => {
    context.optionsFailed = true;
    await open();

    expect(screen.getByText("Type options could not be loaded")).toBeDefined();
    expect(screen.queryByText("All Types")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryOptions).toHaveBeenCalled();
  });

  it("lists the options it has, whatever a later refresh did", async () => {
    context.optionsFailed = true;
    await open(types);

    expect(screen.getByText("Mines")).toBeDefined();
    expect(screen.getByText("All Types")).toBeDefined();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  // An empty project list is not a broken menu: every option is offered at 0.
  it("leaves a menu that loaded alone, however few projects match", async () => {
    await open(types);

    expect(screen.getByText("All Types")).toBeDefined();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  // Nothing to say and nothing to list: the options are simply not there yet.
  it("says nothing while the code tables are still loading", async () => {
    await open();

    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    expect(screen.getByText("All Types")).toBeDefined();
  });
});
