import { useEffect, useMemo, useRef, useState } from "react";
import { Box, ButtonBase, Collapse, Skeleton, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import {
  type ComponentType,
  type ProjectComponent,
  useProjectComponents,
} from "@/api/useProjects";
import { eaoFeatureIdsAt } from "@/components/Layers/eaoVisibility";
import { useMeasure } from "@/components/MapTools/MeasureContext";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import {
  type ComponentTypeGroup,
  findVariant,
  groupComponents,
  type RowPlace,
  rowPlaces,
} from "@/components/Projects/componentGrouping";
import {
  BODY_TEXT,
  hasProjectAt,
  LINK_COLOR,
  SECONDARY_TEXT_COLOR,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import SubmissionGroup, {
  COLLAPSED_LABELS,
  type ComponentControls,
  listSx,
} from "@/components/Projects/SubmissionGroup";
import { METADATA_TOLERANCE_PX } from "@/utils/config";
import { scrollIntoNearestView } from "@/utils/scroll";

const EMPTY_TEXT_COLOR = "#757371";

const NO_COMPONENTS: readonly ProjectComponent[] = [];

/** Tells the map what the panel shows, hides and selects; clears it all when the panel closes. */
const useShowOnMap = (
  components: readonly ProjectComponent[],
  revealed: readonly string[],
  selected: readonly string[],
) => {
  const { setFeatureIds, setHiddenFootprintIds, setSelectedFeatureIds } =
    useRevealedComponents();

  // Footprints only: they are drawn unless hidden, components only if revealed.
  const hiddenFootprints = useMemo(() => {
    const shown = new Set(revealed);
    return components
      .filter(({ footprint, featureId }) => footprint && !shown.has(featureId))
      .map(({ featureId }) => featureId);
  }, [components, revealed]);

  useEffect(() => {
    setFeatureIds(revealed);
    setHiddenFootprintIds(hiddenFootprints);
    return () => {
      setFeatureIds([]);
      setHiddenFootprintIds([]);
    };
  }, [revealed, hiddenFootprints, setFeatureIds, setHiddenFootprintIds]);

  useEffect(() => {
    setSelectedFeatureIds(selected);
    return () => setSelectedFeatureIds([]);
  }, [selected, setSelectedFeatureIds]);
};

/**
 * Hands over the row of the topmost listed feature under each map click, and
 * points the cursor over one. A map tool's clicks, and a project dot, are left
 * to them.
 */
const useMapPicks = (
  map: MapLibreMap | null,
  places: ReadonlyMap<string, RowPlace>,
  onPick: (place: RowPlace) => void,
) => {
  const { tool } = useSelectArea();
  const { placing } = useMeasure();
  const toolOwnsClicks = tool === "select" || placing;
  const placesRef = useRef(places);
  placesRef.current = places;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!map || toolOwnsClicks) return undefined;

    const canvas = map.getCanvas();
    // Whether this hook set the cursor, so it never clears another's.
    let pointing = false;

    const listedAt = (point: MapMouseEvent["point"]) =>
      eaoFeatureIdsAt(map, point, METADATA_TOLERANCE_PX)
        .map((id) => placesRef.current.get(id))
        .find((place) => place !== undefined);

    const onClick = (event: MapMouseEvent) => {
      if (hasProjectAt(map, event.point)) return;
      const place = listedAt(event.point);
      if (place) onPickRef.current(place);
    };
    const unpoint = () => {
      if (pointing) canvas.style.cursor = "";
      pointing = false;
    };
    const onMove = (event: MapMouseEvent) => {
      // The dot's own hover has the cursor there.
      if (hasProjectAt(map, event.point)) {
        pointing = false;
        return;
      }
      if (!listedAt(event.point)) {
        unpoint();
        return;
      }
      // Set on every move: leaving a dot clears it.
      canvas.style.cursor = "pointer";
      pointing = true;
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("mouseout", unpoint);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("mouseout", unpoint);
      unpoint();
    };
  }, [map, toolOwnsClicks]);
};

/** The set with `key` in or out; the same set if that changes nothing. */
const toggledTo = <T,>(
  set: ReadonlySet<T>,
  key: T,
  on: boolean,
): ReadonlySet<T> => {
  if (set.has(key) === on) return set;
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

const toggled = <T,>(set: ReadonlySet<T>, key: T) =>
  toggledTo(set, key, !set.has(key));

type ComponentTypeSectionProps = {
  group: ComponentTypeGroup;
  open: boolean;
  onToggleOpen: () => void;
  /** Called once the section has finished opening. */
  onOpened: () => void;
  hiddenSubmissions: ReadonlySet<string>;
  onToggle: (submissionKey: string) => void;
  expandedSubmissions: ReadonlySet<string>;
  onToggleExpanded: (submissionKey: string) => void;
  controls: ComponentControls;
};

const ComponentTypeSection = ({
  group,
  open,
  onToggleOpen,
  onOpened,
  hiddenSubmissions,
  onToggle,
  expandedSubmissions,
  onToggleExpanded,
  controls,
}: ComponentTypeSectionProps) => {
  const bodyId = `epic-map-project-${group.type.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Box component="section" sx={{ marginTop: "0.5rem" }}>
      <ButtonBase
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls={bodyId}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          paddingBottom: "0.5rem",
          borderRadius: "0.25rem",
          "&:focus-visible": {
            outline: `2px solid ${LINK_COLOR}`,
            outlineOffset: "2px",
          },
        }}
      >
        <ExpandMoreIcon
          aria-hidden
          sx={{
            fontSize: "1.5rem",
            color: SECONDARY_TEXT_COLOR,
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 150ms",
          }}
        />
        <Typography
          component="h4"
          sx={{ ...BODY_TEXT, fontWeight: 700, color: SECONDARY_TEXT_COLOR }}
        >
          {group.title}
        </Typography>
      </ButtonBase>
      <Collapse in={open} onEntered={onOpened}>
        <Box component="ul" id={bodyId} sx={listSx}>
          {group.submissions.map((submission) => (
            <SubmissionGroup
              key={submission.key}
              submission={submission}
              shown={!hiddenSubmissions.has(submission.key)}
              onToggle={() => onToggle(submission.key)}
              expanded={expandedSubmissions.has(submission.key)}
              onToggleExpanded={() => onToggleExpanded(submission.key)}
              controls={controls}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

type MapLayersSectionProps = {
  projectId: number;
  map: MapLibreMap | null;
};

/** A project's submitted project and value components, and their map toggles. */
export default function MapLayersSection({
  projectId,
  map,
}: MapLayersSectionProps) {
  const {
    data: components,
    isLoading,
    isError,
  } = useProjectComponents(projectId);
  const groups = useMemo(() => groupComponents(components ?? []), [components]);
  // Submissions switched off. Everything starts on.
  const [hiddenSubmissions, setHiddenSubmissions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [hiddenByUser, setHiddenByUser] = useState<ReadonlySet<string> | null>(
    null,
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [closedTypes, setClosedTypes] = useState<ReadonlySet<ComponentType>>(
    () => new Set(),
  );
  const [expandedSubmissions, setExpandedSubmissions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const [mapPick, setMapPick] = useState<{
    opening: ComponentType | null;
  } | null>(null);
  const { focused, unfocus } = useSelectArea();
  useEffect(() => {
    if (focused !== null) setSelectedKey(null);
  }, [focused]);

  const startHidden = useMemo(
    () =>
      new Set(
        (components ?? [])
          .filter(({ sensitive }) => sensitive)
          .map(({ featureId }) => featureId),
      ),
    [components],
  );
  const hiddenFeatures = hiddenByUser ?? startHidden;

  const revealed = useMemo(
    () =>
      groups
        .flatMap(({ submissions }) => submissions)
        .filter(({ key }) => !hiddenSubmissions.has(key))
        .flatMap(({ featureIds }) => featureIds)
        .filter((id) => !hiddenFeatures.has(id)),
    [groups, hiddenSubmissions, hiddenFeatures],
  );

  // Only what is drawn: a hidden component has nothing on the map to highlight.
  const highlighted = useMemo(() => {
    const selected = findVariant(groups, selectedKey);
    const shown = new Set(revealed);
    return (selected?.featureIds ?? []).filter((id) => shown.has(id));
  }, [groups, selectedKey, revealed]);

  useShowOnMap(components ?? NO_COMPONENTS, revealed, highlighted);

  const places = useMemo(() => rowPlaces(groups), [groups]);

  // Not through `select`: a map click selects, never deselects.
  useMapPicks(map, places, (place) => {
    const { type, submissionKey, labelIndex, variantKey } = place;
    setSelectedKey(variantKey);
    if (labelIndex >= COLLAPSED_LABELS) {
      setExpandedSubmissions((current) =>
        toggledTo(current, submissionKey, true),
      );
    }
    setClosedTypes((current) => toggledTo(current, type, false));
    setMapPick({ opening: closedTypes.has(type) ? type : null });
  });

  useEffect(() => {
    if (mapPick && !mapPick.opening) {
      scrollIntoNearestView(selectedRowRef.current);
    }
  }, [mapPick]);

  const opened = (type: ComponentType) => {
    if (mapPick?.opening !== type) return;
    setMapPick(null);
    scrollIntoNearestView(selectedRowRef.current);
  };

  const controls: ComponentControls = {
    isShown: (featureIds) => featureIds.some((id) => !hiddenFeatures.has(id)),
    setShown: (featureIds, shown) =>
      setHiddenByUser((current) => {
        const next = new Set(current ?? startHidden);
        featureIds.forEach((id) => (shown ? next.delete(id) : next.add(id)));
        return next;
      }),
    selectedKey,
    select: (key) => {
      unfocus();
      setSelectedKey((current) => (current === key ? null : key));
    },
    selectedRowRef,
  };

  return (
    <Box
      component="section"
      aria-labelledby="epic-map-project-layers"
      sx={{
        padding: "1rem",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <LayersOutlinedIcon
          aria-hidden
          sx={{ fontSize: "1.25rem", color: TEXT_COLOR }}
        />
        <Typography
          id="epic-map-project-layers"
          component="h3"
          sx={{
            fontSize: "1rem",
            fontWeight: 700,
            lineHeight: 1.5,
            color: TEXT_COLOR,
          }}
        >
          Map Layers
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ marginTop: "0.75rem" }}>
          <Skeleton width="60%" />
          <Skeleton width="80%" />
          <Skeleton />
        </Box>
      ) : isError ? (
        <Typography
          sx={{
            marginTop: "0.75rem",
            ...BODY_TEXT,
            color: SECONDARY_TEXT_COLOR,
          }}
        >
          Map layers could not be loaded. Please try again.
        </Typography>
      ) : groups.length === 0 ? (
        <Typography
          sx={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            border: "1px dashed #c6c5c3",
            borderRadius: "0.25rem",
            backgroundColor: "#fafafa",
            ...BODY_TEXT,
            color: EMPTY_TEXT_COLOR,
          }}
        >
          No project or value components published yet for this project.
        </Typography>
      ) : (
        groups.map((group) => (
          <ComponentTypeSection
            key={group.type}
            group={group}
            open={!closedTypes.has(group.type)}
            onToggleOpen={() =>
              setClosedTypes((current) => toggled(current, group.type))
            }
            onOpened={() => opened(group.type)}
            hiddenSubmissions={hiddenSubmissions}
            onToggle={(key) =>
              setHiddenSubmissions((current) => toggled(current, key))
            }
            expandedSubmissions={expandedSubmissions}
            onToggleExpanded={(key) =>
              setExpandedSubmissions((current) => toggled(current, key))
            }
            controls={controls}
          />
        ))
      )}
    </Box>
  );
}
