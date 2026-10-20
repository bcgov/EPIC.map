import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FilterOption } from "@/components/Filters/filterUtils";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import { FILTER_OPTIONS_STALE_MS } from "@/utils/config";

const FILTER_OPTIONS_PATH = "/projects/filter-options";

interface FilterOptionsResponse {
  types: FilterOption[];
  regions: FilterOption[];
}

const NONE: FilterOption[] = [];

/**
 * The Type and Region code tables the dropdowns list.
 *
 * Separate from the project list because the two move on different clocks:
 * Track revises its code tables rarely and caches them for a day, while the
 * projects behind them change - so the menu's shape is worth holding onto far
 * longer than the numbers inside it.
 *
 * These are the code tables rather than the values present in the data, which
 * is what lets an option with no projects still be offered, dimmed at 0.
 *
 * map-api serves these from Track's own tables, so a failure here is a failure
 * rather than an empty menu: the host hears about it through onError, and the
 * menu that has nothing in it says so and offers this retry.
 */
export const useProjectFilterOptions = () => {
  const { api } = useMapWidget();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: epicMapQueryKey("projects", "filter-options"),
    queryFn: async ({ signal }) =>
      (await api.get<FilterOptionsResponse>(FILTER_OPTIONS_PATH, { signal })).data,
    staleTime: FILTER_OPTIONS_STALE_MS,
  });

  // Stable across renders: FiltersContext names it in its value memo's deps.
  const retry = useCallback(() => void refetch(), [refetch]);

  return {
    types: data?.types ?? NONE,
    regions: data?.regions ?? NONE,
    isPending,
    error,
    retry,
  };
};
