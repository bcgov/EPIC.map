import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useProjects } from "@/api/useProjects";
import { useProjectFilterOptions } from "@/api/useProjectFilterOptions";
import {
  filterProjects,
  isAnyFilterActive,
  NO_FILTERS,
  type FilterGroup,
  type FilterOption,
  type FilterState,
  type MapProject,
} from "@/components/Filters/filterUtils";

interface FiltersContextValue {
  /** Every project, before any filter. What the counts are computed over. */
  projects: readonly MapProject[];
  /** The projects the map should be showing. */
  visibleProjects: readonly MapProject[];
  projectsPending: boolean;
  projectsError: unknown;
  retryProjects: () => void;
  types: readonly FilterOption[];
  regions: readonly FilterOption[];
  optionsPending: boolean;
  filters: FilterState;
  anyFilterActive: boolean;
  /** Replace one group's selection outright - the menus compute the next set. */
  setGroupSelection: (group: FilterGroup, selected: Set<number>) => void;
  toggleCertificateIssued: () => void;
  toggleInProgressWorks: () => void;
  clearFilters: () => void;
  /**
   * The filters match no project, and there was a project to match. Kept apart
   * from "nothing to show": with no filter active an empty map is an empty
   * project list, which "No projects match these filters" would misdescribe.
   */
  noMatches: boolean;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

/**
 * The filter bar's state, and the projects it narrows.
 *
 * Above both the bar and the map surface because the two ends of this feature
 * sit in different parts of the tree: the controls are in the bar above the map,
 * and the message that says their combination matches nothing is drawn over the
 * map itself.
 */
export const FiltersProvider = ({ children }: { children: ReactNode }) => {
  const { projects, isPending: projectsPending, error: projectsError, retry } =
    useProjects();
  const { types, regions, isPending: optionsPending } = useProjectFilterOptions();

  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);

  const setGroupSelection = useCallback(
    (group: FilterGroup, selected: Set<number>) =>
      setFilters((current) =>
        group === "typeId"
          ? { ...current, typeIds: selected }
          : { ...current, regionIds: selected },
      ),
    [],
  );

  const toggleCertificateIssued = useCallback(
    () =>
      setFilters((current) => ({
        ...current,
        certificateIssued: !current.certificateIssued,
      })),
    [],
  );

  const toggleInProgressWorks = useCallback(
    () =>
      setFilters((current) => ({
        ...current,
        inProgressWorks: !current.inProgressWorks,
      })),
    [],
  );

  const clearFilters = useCallback(() => setFilters(NO_FILTERS), []);

  const visibleProjects = useMemo(
    () => filterProjects(projects, filters),
    [projects, filters],
  );

  const anyFilterActive = isAnyFilterActive(filters);

  const value = useMemo<FiltersContextValue>(
    () => ({
      projects,
      visibleProjects,
      projectsPending,
      projectsError,
      retryProjects: retry,
      types,
      regions,
      optionsPending,
      filters,
      anyFilterActive,
      setGroupSelection,
      toggleCertificateIssued,
      toggleInProgressWorks,
      clearFilters,
      // Only once the list has arrived: while it is loading there is nothing to
      // have matched, and saying so would flash the message on every mount.
      noMatches:
        !projectsPending &&
        !projectsError &&
        anyFilterActive &&
        projects.length > 0 &&
        visibleProjects.length === 0,
    }),
    [
      projects,
      visibleProjects,
      projectsPending,
      projectsError,
      retry,
      types,
      regions,
      optionsPending,
      filters,
      anyFilterActive,
      setGroupSelection,
      toggleCertificateIssued,
      toggleInProgressWorks,
      clearFilters,
    ],
  );

  return (
    <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
  );
};

export const useFilters = (): FiltersContextValue => {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error("useFilters must be used inside <FiltersProvider />");
  }
  return context;
};
