import { useEffect, useMemo, useState } from "react";
import { Box, ButtonBase, Collapse, Skeleton, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { useProjectComponents } from "@/api/useProjects";
import {
  type ComponentTypeGroup,
  groupComponents,
} from "@/components/Projects/componentGrouping";
import {
  BODY_TEXT,
  LINK_COLOR,
  SECONDARY_TEXT_COLOR,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";
import { useRevealedComponents } from "@/components/Projects/RevealedComponentsContext";
import SubmissionGroup from "@/components/Projects/SubmissionGroup";

const EMPTY_TEXT_COLOR = "#757371";

const listSx = { margin: 0, padding: 0, listStyle: "none" } as const;

/** Puts every submission not switched off on the map, and takes them off when the panel closes. */
const useRevealOnMap = (
  groups: readonly ComponentTypeGroup[],
  hidden: ReadonlySet<string>,
) => {
  const { setFeatureIds } = useRevealedComponents();

  const revealed = useMemo(
    () =>
      groups
        .flatMap(({ submissions }) => submissions)
        .filter(({ key }) => !hidden.has(key))
        .flatMap(({ featureIds }) => featureIds),
    [groups, hidden],
  );

  useEffect(() => {
    setFeatureIds(revealed);
    return () => setFeatureIds([]);
  }, [revealed, setFeatureIds]);
};

type ComponentTypeSectionProps = {
  group: ComponentTypeGroup;
  hidden: ReadonlySet<string>;
  onToggle: (submissionKey: string) => void;
};

const ComponentTypeSection = ({ group, hidden, onToggle }: ComponentTypeSectionProps) => {
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
          "&:focus-visible": { outline: `2px solid ${LINK_COLOR}`, outlineOffset: "2px" },
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
              shown={!hidden.has(submission.key)}
              onToggle={() => onToggle(submission.key)}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

/** A project's submitted project and value components, and their map toggles. */
export default function MapLayersSection({ projectId }: { projectId: number }) {
  const { data: components, isLoading, isError } = useProjectComponents(projectId);
  const groups = useMemo(() => groupComponents(components ?? []), [components]);
  // Submissions switched off. Everything starts on.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  useRevealOnMap(groups, hidden);

  const toggle = (submissionKey: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(submissionKey)) next.add(submissionKey);
      return next;
    });

  return (
    <Box
      component="section"
      aria-labelledby="epic-map-project-layers"
      sx={{ padding: "1rem", borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <LayersOutlinedIcon aria-hidden sx={{ fontSize: "1.25rem", color: TEXT_COLOR }} />
        <Typography
          id="epic-map-project-layers"
          component="h3"
          sx={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.5, color: TEXT_COLOR }}
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
        <Typography sx={{ marginTop: "0.75rem", ...BODY_TEXT, color: SECONDARY_TEXT_COLOR }}>
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
            hidden={hidden}
            onToggle={toggle}
          />
        ))
      )}
    </Box>
  );
}
