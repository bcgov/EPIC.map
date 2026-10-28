import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import type {
  LngLat,
  Map as MapLibreMap,
  MapMouseEvent,
  MapStyleImageMissingEvent,
} from "maplibre-gl";
import { useProjectFeatures } from "@/api/useProjects";
import { useFilters } from "@/components/Filters/FiltersContext";
import { footprintTrackIdAt } from "@/components/Layers/eaoVisibility";
import ProjectCard from "@/components/Projects/ProjectCard";
import ProjectTooltip from "@/components/Projects/ProjectTooltip";
import {
  addMissingProjectImage,
  type DrawnProjectPoint,
  glyphForType,
  type HoveredProject,
  hoveredProjectAt,
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

  // Where the hovered name is drawn, in container pixels; null for no hover.
  const [hover, setHover] = useState<{
    name: string;
    left: number;
    top: number;
  } | null>(null);
  const hovered = useRef<HoveredProject | null>(null);
  const pointer = useRef<MapMouseEvent["point"] | null>(null);

  const clearHover = useCallback(() => {
    hovered.current = null;
    pointer.current = null;
    setHover(null);
  }, []);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return undefined;

    const onImageMissing = (event: MapStyleImageMissingEvent) =>
      addMissingProjectImage(map, event);
    const onStyleData = () => {
      keepProjectsOnTop(map);
      // A basemap switch rebuilds the style, so the name is worked out again
      // rather than left over a dot the new style may not have.
      if (hovered.current) refreshHover();
    };
    const onClick = (event: MapMouseEvent) => {
      // The dot first, then the boundary under it: a dot sits on top of its
      // own footprint, and hitting either should open the same project.
      const projectId =
        projectIdAt(map, event.point, selectedRef.current) ??
        footprintTrackIdAt(map, event.point);
      if (projectId === null) return;
      onSelectRef.current(projectId);
      revealBesideCard(map, event.lngLat);
    };
    const place = (project: HoveredProject) => {
      hovered.current = project;
      const { x, y } = map.project(project.lngLat);
      // Only replaced when what it draws changes; mouse moves are many.
      setHover((current) =>
        current?.name === project.name &&
        current.left === x &&
        current.top === y
          ? current
          : { name: project.name, left: x, top: y },
      );
    };
    /** The name for whatever is under the pointer now, or none. */
    const refreshHover = () => {
      const project =
        pointer.current &&
        hoveredProjectAt(map, pointer.current, selectedRef.current);
      if (project) place(project);
      else clearHover();
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    // Dots overlap, so track the pointer rather than trust mouseenter.
    const onHover = (event: MapMouseEvent) => {
      pointer.current = event.point;
      refreshHover();
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      clearHover();
    };
    // Zooming and panning send no mouse event, so re-place the card here.
    const onCameraMove = () => {
      if (hovered.current) place(hovered.current);
    };

    map.on("styleimagemissing", onImageMissing);
    map.on("styledata", onStyleData);
    map.on("click", onClick);
    map.on("mouseenter", PROJECTS_LAYER_ID, onEnter);
    map.on("mousemove", PROJECTS_LAYER_ID, onHover);
    map.on("mouseleave", PROJECTS_LAYER_ID, onLeave);
    map.on("move", onCameraMove);
    return () => {
      map.off("styleimagemissing", onImageMissing);
      map.off("styledata", onStyleData);
      map.off("click", onClick);
      map.off("mouseenter", PROJECTS_LAYER_ID, onEnter);
      map.off("mousemove", PROJECTS_LAYER_ID, onHover);
      map.off("mouseleave", PROJECTS_LAYER_ID, onLeave);
      map.off("move", onCameraMove);
      clearHover();
    };
  }, [map, clearHover]);

  // A filter that excludes the selected project closes its card. The dot is
  // gone from the map, so a card still describing the project would describe
  // something the map says is not there - and with no dot left, the card's own
  // close button would be the only way out of it.
  useEffect(() => {
    if (selectedId !== null && data && !visibleIds.has(selectedId)) {
      onSelectRef.current(null);
    }
  }, [selectedId, visibleIds, data]);

  // Same for the hover: a dot filtered out sends no mouseleave.
  useEffect(() => {
    if (hovered.current && !visibleIds.has(hovered.current.id)) clearHover();
  }, [visibleIds, clearHover]);

  useEffect(() => {
    if (map && drawn) showProjects(map, drawn, selectedRef.current);
  }, [map, drawn]);

  useEffect(() => {
    if (map) setSelectedProject(map, selectedId);
  }, [map, selectedId]);

  const point =
    selectedId === null
      ? null
      : (data?.features.find((feature) => feature.id === selectedId)
          ?.properties ?? null);

  return (
    <>
      {hover && (
        <ProjectTooltip name={hover.name} left={hover.left} top={hover.top} />
      )}
      {selectedId !== null && (
        <ProjectCard
          key={selectedId}
          projectId={selectedId}
          point={point}
          onClose={() => onSelect(null)}
        />
      )}
    </>
  );
}
