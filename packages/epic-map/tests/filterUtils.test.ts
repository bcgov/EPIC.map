import { describe, expect, it } from "vitest";
import {
  allRowState,
  facetCounts,
  facetTotal,
  filterProjects,
  isAnyFilterActive,
  matchesFilters,
  NO_FILTERS,
  toggleAll,
  toggleOption,
  type FilterOption,
  type FilterState,
  type MapProject,
} from "@/components/Filters/filterUtils";

const MINES = 1;
const INDUSTRIAL = 2;
const TRANSPORT = 3;

const SKEENA = 10;
const CARIBOO = 11;

const types: FilterOption[] = [
  { id: MINES, name: "Mines" },
  { id: INDUSTRIAL, name: "Industrial" },
  { id: TRANSPORT, name: "Transportation" },
];

let nextId = 0;

const project = (overrides: Partial<MapProject> = {}): MapProject => ({
  id: (nextId += 1),
  name: `Project ${nextId}`,
  latitude: 54,
  longitude: -127,
  typeId: MINES,
  regionId: SKEENA,
  certificateIssued: false,
  inProgressWorks: false,
  isClosed: false,
  ...overrides,
});

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...NO_FILTERS,
  ...overrides,
});

describe("matchesFilters", () => {
  it("lets everything through when nothing is selected", () => {
    const projects = [
      project({ typeId: MINES }),
      project({ typeId: null, regionId: null }),
    ];

    expect(filterProjects(projects, NO_FILTERS)).toHaveLength(2);
  });

  it("keeps a project matching any selected value in a group", () => {
    const mine = project({ typeId: MINES });
    const road = project({ typeId: TRANSPORT });
    const plant = project({ typeId: INDUSTRIAL });

    const selected = filters({ typeIds: new Set([MINES, TRANSPORT]) });

    expect(filterProjects([mine, road, plant], selected)).toEqual([mine, road]);
  });

  it("ands the two groups together", () => {
    const wanted = project({ typeId: MINES, regionId: SKEENA });
    const wrongRegion = project({ typeId: MINES, regionId: CARIBOO });

    const selected = filters({
      typeIds: new Set([MINES]),
      regionIds: new Set([SKEENA]),
    });

    expect(filterProjects([wanted, wrongRegion], selected)).toEqual([wanted]);
  });

  it("hides a project with no value in a group once that group is filtered", () => {
    // A user picking "Skeena" is asking for projects in Skeena, and a project
    // with no region is not one of them.
    const untyped = project({ typeId: null });

    expect(matchesFilters(untyped, NO_FILTERS)).toBe(true);
    expect(
      matchesFilters(untyped, filters({ typeIds: new Set([MINES]) })),
    ).toBe(false);
  });

  it("applies each toggle only while it is on", () => {
    const certified = project({ certificateIssued: true });
    const uncertified = project({ certificateIssued: false });

    expect(filterProjects([certified, uncertified], NO_FILTERS)).toHaveLength(2);
    expect(
      filterProjects([certified, uncertified], filters({ certificateIssued: true })),
    ).toEqual([certified]);
  });

  it("ands the two toggles together", () => {
    const both = project({ certificateIssued: true, inProgressWorks: true });
    const certOnly = project({ certificateIssued: true, inProgressWorks: false });

    const selected = filters({ certificateIssued: true, inProgressWorks: true });

    expect(filterProjects([both, certOnly], selected)).toEqual([both]);
  });

  it("ands the toggles with the groups", () => {
    const wanted = project({ typeId: MINES, certificateIssued: true });
    const wrongType = project({ typeId: TRANSPORT, certificateIssued: true });
    const noCert = project({ typeId: MINES, certificateIssued: false });

    const selected = filters({
      typeIds: new Set([MINES]),
      certificateIssued: true,
    });

    expect(filterProjects([wanted, wrongType, noCert], selected)).toEqual([wanted]);
  });
});

describe("isAnyFilterActive", () => {
  it("is false only when nothing is narrowing the map", () => {
    expect(isAnyFilterActive(NO_FILTERS)).toBe(false);
    expect(isAnyFilterActive(filters({ typeIds: new Set([MINES]) }))).toBe(true);
    expect(isAnyFilterActive(filters({ regionIds: new Set([SKEENA]) }))).toBe(true);
    expect(isAnyFilterActive(filters({ certificateIssued: true }))).toBe(true);
    expect(isAnyFilterActive(filters({ inProgressWorks: true }))).toBe(true);
  });
});

describe("facetCounts", () => {
  it("counts every option when nothing else is filtering", () => {
    const projects = [
      project({ typeId: MINES }),
      project({ typeId: MINES }),
      project({ typeId: TRANSPORT }),
    ];

    const counts = facetCounts(projects, NO_FILTERS, "typeId");

    expect(counts.get(MINES)).toBe(2);
    expect(counts.get(TRANSPORT)).toBe(1);
  });

  it("ignores the group's own selection, so an unticked option still shows its yield", () => {
    // Without this an unticked option would read 0 and the menu would be unusable
    // the moment anything in it was ticked.
    const projects = [
      project({ typeId: MINES }),
      project({ typeId: TRANSPORT }),
    ];

    const counts = facetCounts(
      projects,
      filters({ typeIds: new Set([MINES]) }),
      "typeId",
    );

    expect(counts.get(MINES)).toBe(1);
    expect(counts.get(TRANSPORT)).toBe(1);
  });

  it("reflects the other group's selection", () => {
    const projects = [
      project({ typeId: MINES, regionId: SKEENA }),
      project({ typeId: MINES, regionId: CARIBOO }),
      project({ typeId: TRANSPORT, regionId: CARIBOO }),
    ];

    const counts = facetCounts(
      projects,
      filters({ regionIds: new Set([SKEENA]) }),
      "typeId",
    );

    expect(counts.get(MINES)).toBe(1);
    expect(counts.get(TRANSPORT)).toBeUndefined();
  });

  it("reflects the toggles", () => {
    const projects = [
      project({ typeId: MINES, certificateIssued: true }),
      project({ typeId: MINES, certificateIssued: false }),
      project({ typeId: TRANSPORT, inProgressWorks: true, certificateIssued: true }),
    ];

    const counts = facetCounts(
      projects,
      filters({ certificateIssued: true }),
      "typeId",
    );

    expect(counts.get(MINES)).toBe(1);
    expect(counts.get(TRANSPORT)).toBe(1);
  });

  it("leaves an option that would yield nothing absent, for the menu to show as 0", () => {
    const projects = [project({ typeId: MINES, regionId: SKEENA })];

    const counts = facetCounts(
      projects,
      filters({ regionIds: new Set([CARIBOO]) }),
      "typeId",
    );

    expect(counts.get(MINES)).toBeUndefined();
    expect(counts.get(MINES) ?? 0).toBe(0);
  });

  it("does not count a project with no value in the group", () => {
    const projects = [project({ typeId: null }), project({ typeId: MINES })];

    expect(facetTotal(facetCounts(projects, NO_FILTERS, "typeId"))).toBe(1);
  });
});

describe("facetTotal", () => {
  it("matches what selecting every option actually yields", () => {
    // The All row's number has to be deliverable: pressing it selects each
    // option, which under include semantics drops the untyped project.
    const projects = [
      project({ typeId: MINES }),
      project({ typeId: TRANSPORT }),
      project({ typeId: null }),
    ];

    const counts = facetCounts(projects, NO_FILTERS, "typeId");
    const all = filters({ typeIds: new Set(types.map((type) => type.id)) });

    expect(facetTotal(counts)).toBe(2);
    expect(filterProjects(projects, all)).toHaveLength(2);
  });

  it("follows the other filters", () => {
    const projects = [
      project({ typeId: MINES, regionId: SKEENA }),
      project({ typeId: TRANSPORT, regionId: CARIBOO }),
    ];

    const counts = facetCounts(
      projects,
      filters({ regionIds: new Set([SKEENA]) }),
      "typeId",
    );

    expect(facetTotal(counts)).toBe(1);
  });
});

describe("allRowState", () => {
  it("is unchecked, indeterminate, then checked as the selection grows", () => {
    expect(allRowState(new Set(), types)).toBe("none");
    expect(allRowState(new Set([MINES]), types)).toBe("some");
    expect(allRowState(new Set([MINES, INDUSTRIAL]), types)).toBe("some");
    expect(allRowState(new Set([MINES, INDUSTRIAL, TRANSPORT]), types)).toBe("all");
  });

  it("is not fully checked on a selection holding an id the menu no longer offers", () => {
    // Otherwise a code table that dropped a type would leave the row checked
    // while one of the options under it was not.
    expect(allRowState(new Set([MINES, 999]), types)).toBe("some");
  });

  it("is unchecked when there are no options at all", () => {
    expect(allRowState(new Set(), [])).toBe("none");
  });
});

describe("toggleAll", () => {
  it("selects everything from unchecked", () => {
    expect([...toggleAll(new Set(), types)]).toEqual([MINES, INDUSTRIAL, TRANSPORT]);
  });

  it("selects everything from indeterminate", () => {
    expect([...toggleAll(new Set([MINES]), types)]).toEqual([
      MINES,
      INDUSTRIAL,
      TRANSPORT,
    ]);
  });

  it("clears everything from checked", () => {
    const all = new Set([MINES, INDUSTRIAL, TRANSPORT]);
    expect([...toggleAll(all, types)]).toEqual([]);
  });
});

describe("toggleOption", () => {
  it("adds then removes, without mutating what it was given", () => {
    const selected = new Set([MINES]);

    expect([...toggleOption(selected, TRANSPORT)]).toEqual([MINES, TRANSPORT]);
    expect([...toggleOption(selected, MINES)]).toEqual([]);
    expect([...selected]).toEqual([MINES]);
  });
});
