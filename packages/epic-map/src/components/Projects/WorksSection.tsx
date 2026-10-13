import { useState } from "react";
import { Box, ButtonBase, Collapse, Skeleton, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useProjectWorks, type ProjectWork } from "@/api/useProjects";
import ExpandableText from "@/components/Projects/ExpandableText";
import {
  BODY_TEXT,
  LINK_COLOR,
  SECONDARY_TEXT_COLOR,
  TEXT_COLOR,
  workMetaLine,
  workStateBadge,
} from "@/components/Projects/projectUtils";

const COUNT_FILL = "#d8eafd";
const COUNT_TEXT = "#053662";

const WorkStateBadge = ({ state }: { state: string | null }) => {
  const { label, fill, border } = workStateBadge(state);
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        height: "1.5rem",
        padding: "0 0.5rem",
        border: `1px solid ${border}`,
        borderRadius: "0.75rem",
        backgroundColor: fill,
        color: TEXT_COLOR,
        fontSize: "0.75rem",
        lineHeight: "1rem",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
};

const WorkItem = ({ work }: { work: ProjectWork }) => {
  const meta = workMetaLine(work);
  return (
    <Box component="li" sx={{ "& + &": { marginTop: "1.25rem" } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
        <Typography
          component="h4"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: "1rem",
            fontWeight: 700,
            lineHeight: "1.375rem",
            color: TEXT_COLOR,
          }}
        >
          {work.title}
        </Typography>
        <WorkStateBadge state={work.state} />
      </Box>
      {meta && (
        <Typography sx={{ marginTop: "0.25rem", ...BODY_TEXT, color: SECONDARY_TEXT_COLOR }}>
          {meta}
        </Typography>
      )}
      {work.description && (
        <ExpandableText text={work.description} lines={1} marginTop="0.25rem" />
      )}
    </Box>
  );
};

/** A project's works, in progress first. Not shown at all for a project with none. */
export default function WorksSection({ projectId }: { projectId: number }) {
  const { data: works, isLoading, isError } = useProjectWorks(projectId);
  const [open, setOpen] = useState(true);

  if (!isLoading && !isError && !works?.length) return null;

  return (
    <Box component="section" sx={{ padding: "1rem" }}>
      <ButtonBase
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-controls="epic-map-project-works"
        disabled={isLoading || isError}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          borderRadius: "0.25rem",
          "&:focus-visible": { outline: `2px solid ${LINK_COLOR}`, outlineOffset: "2px" },
        }}
      >
        <ExpandMoreIcon
          aria-hidden
          sx={{
            fontSize: "1.5rem",
            color: TEXT_COLOR,
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 150ms",
          }}
        />
        <Typography
          component="h3"
          sx={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.5, color: TEXT_COLOR }}
        >
          Works
        </Typography>
        {works && (
          <Box
            component="span"
            aria-label={`${works.length} works`}
            sx={{
              minWidth: "1.25rem",
              height: "1.25rem",
              padding: "0 0.375rem",
              borderRadius: "0.25rem",
              backgroundColor: COUNT_FILL,
              color: COUNT_TEXT,
              fontSize: "0.75rem",
              fontWeight: 700,
              lineHeight: "1.25rem",
              textAlign: "center",
            }}
          >
            {works.length}
          </Box>
        )}
      </ButtonBase>

      {isLoading ? (
        <Box sx={{ marginTop: "1rem" }}>
          <Skeleton width="80%" />
          <Skeleton width="50%" />
          <Skeleton />
        </Box>
      ) : isError ? (
        <Typography sx={{ marginTop: "0.75rem", ...BODY_TEXT, color: SECONDARY_TEXT_COLOR }}>
          Works could not be loaded. Please try again.
        </Typography>
      ) : (
        <Collapse in={open}>
          <Box
            component="ul"
            id="epic-map-project-works"
            sx={{ margin: "1rem 0 0", padding: 0, listStyle: "none" }}
          >
            {works?.map((work) => <WorkItem key={work.id} work={work} />)}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
