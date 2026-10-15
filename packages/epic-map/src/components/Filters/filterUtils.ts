/**
 * Matching projects against the filter bar, and the faceted counts the menus show.
 *
 * Pure, and deliberately kept out of the components: the counting rule is the
 * part of this feature that can be wrong without anything looking broken, and
 * this is where it can be tested.
 *
 * Everything runs over the whole project list in the browser rather than as a
 * query. The counts are faceted - every option shows what it would actually
 * yield given the filters already applied elsewhere - so a menu that is open
 * while the user ticks a box in it has to recount on each click. Against a
 * province-wide list that is a few hundred comparisons; as requests it would be
 * a round trip per checkbox.
 */

/** A project as `GET /projects` returns it. */
export interface MapProject {
  id: number;
  name: string;
  /**
   * Decimal degrees. Never null: map-api returns open projects only, and drops
   * any whose coordinates Track does not hold or cannot parse, so a project
   * that reaches the browser is one the map can place.
   */
  latitude: number;
  longitude: number;
  /** Track type id, or null when the project has no type. */
  typeId: number | null;
  /** Track ENV region id, or null when the project has no region. */
  regionId: number | null;
  certificateIssued: boolean;
  inProgressWorks: boolean;
}

/** One row of a code table, as a dropdown lists it. */
export interface FilterOption {
  id: number;
  name: string;
}

/** The two multi-select groups, named the way a project's fields are. */
export type FilterGroup = "typeId" | "regionId";

/** Everything the bar can narrow by. */
export interface FilterState {
  typeIds: ReadonlySet<number>;
  regionIds: ReadonlySet<number>;
  certificateIssued: boolean;
  inProgressWorks: boolean;
}

export const NO_FILTERS: FilterState = {
  typeIds: new Set(),
  regionIds: new Set(),
  certificateIssued: false,
  inProgressWorks: false,
};

/** The selection for one group, out of the whole state. */
export const selectionFor = (
  filters: FilterState,
  group: FilterGroup,
): ReadonlySet<number> =>
  group === "typeId" ? filters.typeIds : filters.regionIds;

/**
 * Whether anything is narrowing the map.
 *
 * What the "Clear filters" link appears on, and so also what decides whether an
 * empty map is worth explaining: with no filter active, nothing to show is a
 * project list that is genuinely empty rather than a combination that matches
 * nothing.
 */
export const isAnyFilterActive = (filters: FilterState): boolean =>
  filters.typeIds.size > 0 ||
  filters.regionIds.size > 0 ||
  filters.certificateIssued ||
  filters.inProgressWorks;

/**
 * Whether a project satisfies one group.
 *
 * Include semantics: an empty selection means the group is not filtering at
 * all, and once it is, a project with no value in that group cannot match. That
 * is what makes a project with no region disappear when a region is chosen,
 * which is what a user picking "Skeena" means.
 */
const passesGroup = (
  selected: ReadonlySet<number>,
  value: number | null,
): boolean => selected.size === 0 || (value !== null && selected.has(value));

/** Whether a project passes both toggles. A toggle that is off asks nothing. */
const passesToggles = (
  project: MapProject,
  filters: FilterState,
): boolean =>
  (!filters.certificateIssued || project.certificateIssued) &&
  (!filters.inProgressWorks || project.inProgressWorks);

/** Whether a project survives every active filter. */
export const matchesFilters = (
  project: MapProject,
  filters: FilterState,
): boolean =>
  passesGroup(filters.typeIds, project.typeId) &&
  passesGroup(filters.regionIds, project.regionId) &&
  passesToggles(project, filters);

/** The projects the map should be showing. */
export const filterProjects = (
  projects: readonly MapProject[],
  filters: FilterState,
): MapProject[] => projects.filter((project) => matchesFilters(project, filters));

/**
 * Whether a project passes everything *except* one group's own selection.
 *
 * The basis of a faceted count: an option's number has to answer "what would I
 * get if I picked this", which it cannot do while the group's current selection
 * is still being applied - the count beside an unticked option would otherwise
 * always be 0.
 */
const passesOtherThan = (
  project: MapProject,
  filters: FilterState,
  group: FilterGroup,
): boolean => {
  const otherGroup: FilterGroup = group === "typeId" ? "regionId" : "typeId";
  return (
    passesGroup(selectionFor(filters, otherGroup), project[otherGroup]) &&
    passesToggles(project, filters)
  );
};

/**
 * What each option in a group would yield, keyed by option id.
 *
 * Counted against `options` rather than against whatever ids the projects
 * carry. The two arrive from different endpoints with different cache lives, so
 * a project can hold a type or region the option list does not offer - a
 * retired code table row, or simply a newer list than the one in hand. Such a
 * project is unreachable through this menu, and counting it would put a number
 * on the "All" row that pressing it cannot deliver.
 */
export const facetCounts = (
  projects: readonly MapProject[],
  filters: FilterState,
  group: FilterGroup,
  options: readonly FilterOption[],
): Map<number, number> => {
  const counts = new Map<number, number>();
  const offered = new Set(options.map((option) => option.id));

  projects.forEach((project) => {
    const value = project[group];
    if (value === null || !offered.has(value)) return;
    if (!passesOtherThan(project, filters, group)) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return counts;
};

/**
 * The number beside the "All ..." row.
 *
 * The sum of the option counts rather than every project passing the other
 * filters, and the difference is the projects this menu cannot reach: those
 * with no value in this group, and those whose value is not one of its
 * options. Selecting the "All" row selects each option, which under include
 * semantics excludes exactly those - so counting them here would print a
 * number the row does not deliver when pressed.
 */
export const facetTotal = (counts: ReadonlyMap<number, number>): number => {
  let total = 0;
  counts.forEach((count) => {
    total += count;
  });
  return total;
};

/** How the "All ..." checkbox should be drawn for a group. */
export type AllRowState = "none" | "some" | "all";

export const allRowState = (
  selected: ReadonlySet<number>,
  options: readonly FilterOption[],
): AllRowState => {
  if (selected.size === 0) return "none";
  // Measured against the options actually offered, so a selection holding an id
  // the code table no longer lists cannot leave the row stuck at "some".
  const selectedOptions = options.filter((option) => selected.has(option.id));
  return selectedOptions.length === options.length && options.length > 0
    ? "all"
    : "some";
};

/**
 * The selection after the "All ..." row is pressed: everything, or nothing.
 *
 * Indeterminate behaves like unchecked, which is what makes the row a way out
 * of a partial selection in one press rather than two.
 */
export const toggleAll = (
  selected: ReadonlySet<number>,
  options: readonly FilterOption[],
): Set<number> =>
  allRowState(selected, options) === "all"
    ? new Set()
    : new Set(options.map((option) => option.id));

/** The selection after one option is ticked or unticked. */
export const toggleOption = (
  selected: ReadonlySet<number>,
  optionId: number,
): Set<number> => {
  const next = new Set(selected);
  if (!next.delete(optionId)) next.add(optionId);
  return next;
};
