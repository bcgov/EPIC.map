import { useEffect, useMemo, useState } from "react";
import { Box, ButtonBase, Collapse, Skeleton, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { type ProjectComponent, useProjectComponents } from "@/api/useProjects";
import {
  type ComponentTypeGroup,
  findVariant,
  groupComponents,
} from "@/components/Projects/componentGrouping";
import {
  BODY_TEXT,
  LINK_COLOR,
  SECONDARY_TEXT_COLOR,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import SubmissionGroup, {
  type ComponentControls,
  listSx,
} from "@/components/Projects/SubmissionGroup";

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

type ComponentTypeSectionProps = {
  group: ComponentTypeGroup;
  hiddenSubmissions: ReadonlySet<string>;
  onToggle: (submissionKey: string) => void;
  controls: ComponentControls;
};

const ComponentTypeSection = ({
  group,
  hiddenSubmissions,
  onToggle,
  controls,
}: ComponentTypeSectionProps) => {
  const [open, setOpen] = useState(true);
  const bodyId = `epic-map-project-${group.type.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Box component="section" sx={{ marginTop: "0.5rem" }}>
      <ButtonBase
        onClick={() => setOpen((shown) => !shown)}
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
      <Collapse in={open}>
        <Box component="ul" id={bodyId} sx={listSx}>
          {group.submissions.map((submission) => (
            <SubmissionGroup
              key={submission.key}
              submission={submission}
              shown={!hiddenSubmissions.has(submission.key)}
              onToggle={() => onToggle(submission.key)}
              controls={controls}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

/** A project's submitted project and value components, and their map toggles. */
export default function MapLayersSection({ projectId }: { projectId: number }) {
  const {
    data: components,
    isLoading,
    isError,
  } = useProjectComponents(projectId);
  const groups = useMemo(() => groupComponents(components ?? []), [components]);
  // Submissions switched off. Everything starts on.
  const [hiddenSubmissions, setHiddenSubmissions] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hiddenByUser, setHiddenByUser] = useState<ReadonlySet<string> | null>(
    null,
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  const controls: ComponentControls = {
    isShown: (featureIds) => featureIds.some((id) => !hiddenFeatures.has(id)),
    setShown: (featureIds, shown) =>
      setHiddenByUser((current) => {
        const next = new Set(current ?? startHidden);
        featureIds.forEach((id) => (shown ? next.delete(id) : next.add(id)));
        return next;
      }),
    selectedKey,
    select: (key) =>
      setSelectedKey((current) => (current === key ? null : key)),
  };

  const toggle = (submissionKey: string) =>
    setHiddenSubmissions((current) => {
      const next = new Set(current);
      if (!next.delete(submissionKey)) next.add(submissionKey);
      return next;
    });

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
            hiddenSubmissions={hiddenSubmissions}
            onToggle={toggle}
            controls={controls}
          />
        ))
      )}
    </Box>
  );
}
