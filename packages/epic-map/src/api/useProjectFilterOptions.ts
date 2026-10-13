import axios from "axios";
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
const EMPTY: FilterOptionsResponse = { types: NONE, regions: NONE };

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
 * A 404 is read as "no options yet" for the same reason as the project list -
 * see useProjects.
 */
export const useProjectFilterOptions = () => {
  const { api } = useMapWidget();

  const { data, isPending, error } = useQuery({
    queryKey: epicMapQueryKey("projects", "filter-options"),
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get<FilterOptionsResponse>(
          FILTER_OPTIONS_PATH,
          { signal, epicMapSilentStatuses: [404] },
        );
        return response.data;
      } catch (cause) {
        if (axios.isAxiosError(cause) && cause.response?.status === 404) {
          return EMPTY;
        }
        throw cause;
      }
    },
    staleTime: FILTER_OPTIONS_STALE_MS,
  });

  return {
    types: data?.types ?? NONE,
    regions: data?.regions ?? NONE,
    isPending,
    error,
  };
};
