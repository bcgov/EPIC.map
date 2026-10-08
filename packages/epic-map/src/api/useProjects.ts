import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import type { MapProject } from "@/components/Filters/filterUtils";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import { PROJECTS_STALE_MS } from "@/utils/config";

const PROJECTS_PATH = "/projects";

interface ProjectListResponse {
  projects: MapProject[];
}

const NONE: MapProject[] = [];

/**
 * Every EAO project, as map-api reduces EPIC.track's records for the map.
 *
 * The whole list in one request, unpaged: the filter bar's counts are faceted,
 * so what each option would yield depends on every other filter, which cannot be
 * answered from a page of the data.
 *
 * A 404 is read as "no projects yet" rather than as a failure. The service
 * behind this endpoint is a separate ticket, so until it lands the bar should
 * render empty rather than put an error in front of the user or in the host's
 * `onError`. Remove the tolerance once the endpoint is real - a 404 then means
 * something is genuinely wrong.
 */
export const useProjects = () => {
  const { api } = useMapWidget();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: epicMapQueryKey("projects"),
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get<ProjectListResponse>(PROJECTS_PATH, {
          signal,
          epicMapSilentStatuses: [404],
        });
        return response.data.projects;
      } catch (cause) {
        if (axios.isAxiosError(cause) && cause.response?.status === 404) {
          return NONE;
        }
        throw cause;
      }
    },
    staleTime: PROJECTS_STALE_MS,
  });

  return {
    projects: data ?? NONE,
    isPending,
    error,
    retry: () => void refetch(),
  };
};
