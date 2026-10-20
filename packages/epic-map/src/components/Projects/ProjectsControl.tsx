import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Point } from "geojson";
import type {
  LngLat,
  Map as MapLibreMap,
  MapMouseEvent,
  MapStyleImageMissingEvent,
} from "maplibre-gl";
import { useProjectFeatures } from "@/api/useProjects";
import { useFilters } from "@/components/Filters/FiltersContext";
import ProjectCard from "@/components/Projects/ProjectCard";
import {
  addMissingProjectImage,
  type DrawnProjectPoint,
  glyphForType,
  keepProjectsOnTop,
  projectIdAt,
  PROJECTS_LAYER_ID,
  setSelectedProject,
  showProjects,
} from "@/components/Projects/projectUtils";
import { FOCUS_FLY_MS, PROJECT_CARD_WIDTH_PX } from "@/utils/config";

/** Space kept between a revealed dot and the card's edge. */
const REVEAL_MARGIN_PX = 48;

type ProjectsControlProps = {
  map: MapLibreMap | null;
  selectedId: number | null;
  onSelect: (projectId: number | null) => void;
};

/** Pans just enough that a dot the card would cover sits beside it instead. */
const revealBesideCard = (map: MapLibreMap, lngLat: LngLat) => {
  const { x } = map.project(lngLat);
  const visibleWidth = map.getContainer().clientWidth - PROJECT_CARD_WIDTH_PX;
  if (x <= visibleWidth - REVEAL_MARGIN_PX) return;
  map.panBy([x - visibleWidth / 2, 0], { duration: FOCUS_FLY_MS });
};

/** EPIC.Track projects as dots, and the card for the one clicked. */
export default function ProjectsControl({
  map,
  selectedId,
  onSelect,
}: ProjectsControlProps) {
  const { data } = useProjectFeatures();
  const { visibleProjects } = useFilters();

  const visibleIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );

  const drawn = useMemo<FeatureCollection<Point, DrawnProjectPoint> | null>(
    () => {
      if (!data) return null;
      return {
        ...data,
        features: data.features
          .filter((feature) => visibleIds.has(feature.properties.id))
          .map((feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              glyph: glyphForType(feature.properties.typeName),
            },
          })),
      };
    },
    [data, visibleIds],
  );

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return undefined;

    const onImageMissing = (event: MapStyleImageMissingEvent) =>
      addMissingProjectImage(map, event);
    const onStyleData = () => keepProjectsOnTop(map);
    const onClick = (event: MapMouseEvent) => {
      const projectId = projectIdAt(map, event.point);
      if (projectId === null) return;
      onSelectRef.current(projectId);
      revealBesideCard(map, event.lngLat);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("styleimagemissing", onImageMissing);
    map.on("styledata", onStyleData);
    map.on("click", onClick);
    map.on("mouseenter", PROJECTS_LAYER_ID, onEnter);
    map.on("mouseleave", PROJECTS_LAYER_ID, onLeave);
    return () => {
      map.off("styleimagemissing", onImageMissing);
      map.off("styledata", onStyleData);
      map.off("click", onClick);
      map.off("mouseenter", PROJECTS_LAYER_ID, onEnter);
      map.off("mouseleave", PROJECTS_LAYER_ID, onLeave);
    };
  }, [map]);

  // A filter that excludes the selected project closes its card. The dot is
  // gone from the map, so a card still describing the project would describe
  // something the map says is not there - and with no dot left, the card's own
  // close button would be the only way out of it.
  useEffect(() => {
    if (selectedId !== null && data && !visibleIds.has(selectedId)) {
      onSelectRef.current(null);
    }
  }, [selectedId, visibleIds, data]);

  useEffect(() => {
    if (map && drawn) showProjects(map, drawn, selectedRef.current);
  }, [map, drawn]);

  useEffect(() => {
    if (map) setSelectedProject(map, selectedId);
  }, [map, selectedId]);

  if (selectedId === null) return null;

  const point =
    data?.features.find((feature) => feature.id === selectedId)?.properties ??
    null;

  return (
    <ProjectCard
      key={selectedId}
      projectId={selectedId}
      point={point}
      onClose={() => onSelect(null)}
    />
  );
}
