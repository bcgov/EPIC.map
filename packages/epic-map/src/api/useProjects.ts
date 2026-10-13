import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection, Point } from "geojson";
import type { MapProject } from "@/components/Filters/filterUtils";
import { PROJECTS_REFRESH_MS } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const PROJECTS_PATH = "/projects";

/** What a project's dot is drawn from. */
export interface ProjectPoint {
  id: number;
  name: string;
  typeId: number | null;
  typeName: string | null;
  regionId: number | null;
  certificateIssued: boolean;
  hasWorksInProgress: boolean;
}

/** What the project card shows. */
export interface Project extends ProjectPoint {
  description: string | null;
  proponentName: string | null;
  regionName: string | null;
  eaCertificate: string | null;
  epicUrl: string | null;
  longitude: number;
  latitude: number;
}

export type ProjectFeatures = FeatureCollection<Point, ProjectPoint>;

const NONE: MapProject[] = [];

// map-api serves open projects only, each with a location.
const toMapProject = ({
  geometry,
  properties,
}: ProjectFeatures["features"][number]): MapProject => ({
  id: properties.id,
  name: properties.name,
  longitude: geometry.coordinates[0],
  latitude: geometry.coordinates[1],
  typeId: properties.typeId,
  regionId: properties.regionId,
  certificateIssued: properties.certificateIssued,
  inProgressWorks: properties.hasWorksInProgress,
  isClosed: false,
});

/**
 * Every open EPIC.Track project, as map-api serves them. map-api caches Track
 * for the same period, so refetching sooner would only return the same list.
 */
export const useProjectFeatures = () => {
  const { api } = useMapWidget();

  return useQuery({
    queryKey: epicMapQueryKey("projects"),
    queryFn: async ({ signal }) =>
      (await api.get<ProjectFeatures>(PROJECTS_PATH, { signal })).data,
    staleTime: PROJECTS_REFRESH_MS,
    refetchInterval: PROJECTS_REFRESH_MS,
  });
};

/** The same projects as a flat list, for the filter bar and search. */
export const useProjects = () => {
  const { data, isPending, error, refetch } = useProjectFeatures();

  const projects = useMemo(
    () => (data ? data.features.map(toMapProject) : NONE),
    [data],
  );

  // Stable across renders: FiltersContext names it in its value memo's deps.
  const retry = useCallback(() => void refetch(), [refetch]);

  return { projects, isPending, error, retry };
};

export const useProject = (projectId: number | null) => {
  const { api } = useMapWidget();

  return useQuery({
    queryKey: epicMapQueryKey("projects", projectId),
    queryFn: async ({ signal }) =>
      (await api.get<Project>(`${PROJECTS_PATH}/${projectId}`, { signal })).data,
    enabled: projectId !== null,
    staleTime: PROJECTS_REFRESH_MS,
  });
};

/** One work on a project's card, as map-api orders them. */
export interface ProjectWork {
  id: number;
  title: string | null;
  state: string | null;
  phaseName: string | null;
  decisionDate: string | null;
  description: string | null;
}

export const useProjectWorks = (projectId: number) => {
  const { api } = useMapWidget();

  return useQuery({
    queryKey: epicMapQueryKey("projects", projectId, "works"),
    queryFn: async ({ signal }) =>
      (
        await api.get<ProjectWork[]>(`${PROJECTS_PATH}/${projectId}/works`, {
          signal,
        })
      ).data,
    staleTime: PROJECTS_REFRESH_MS,
  });
};
