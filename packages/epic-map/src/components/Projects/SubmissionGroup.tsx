import { useState } from "react";
import { Box, ButtonBase, Switch, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditNoteIcon from "@mui/icons-material/EditNote";
import WarningIcon from "@mui/icons-material/Warning";
import { toggleSx } from "@/components/Layers/LayerRow";
import {
  type ComponentFlag as Flag,
  type LabelGroup,
  type Submission,
  submissionDate,
  submissionSources,
  submissionTitle,
} from "@/components/Projects/componentGrouping";
import {
  LINK_COLOR,
  SECONDARY_TEXT_COLOR,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";

const MUTED_TEXT_COLOR = "#9f9d9c";

/** Labels shown before the rest collapse behind "Show all". */
const COLLAPSED_LABELS = 5;

const FLAGS = {
  sensitive: { text: "Sensitive", color: "#ce3e39", Icon: WarningIcon },
  adjusted: { text: "Adjusted by GIS", color: "#8a6a00", Icon: EditNoteIcon },
} as const;

/** The map's colour for each style category, as eao_categories.py sets it. */
const BULLET_COLORS: Record<string, string> = {
  footprint: "#0072B2",
  amendment: "#CC79A7",
  value_component: "#009E73",
  project_component: "#E69F00",
};

const LABEL_TEXT = { fontSize: "0.75rem", lineHeight: "1.125rem" } as const;

const listSx = { margin: 0, padding: 0, listStyle: "none" } as const;

const Bullet = ({ category }: { category: string }) => (
  <Box
    aria-hidden
    sx={{
      flexShrink: 0,
      width: "4px",
      height: "4px",
      backgroundColor: BULLET_COLORS[category] ?? BULLET_COLORS.project_component,
    }}
  />
);

const ComponentFlag = ({ flag }: { flag: Flag | null }) => {
  if (!flag) return null;
  const { text, color, Icon } = FLAGS[flag];
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: "2px", flexShrink: 0, color }}
    >
      <Icon aria-hidden sx={{ fontSize: "1rem" }} />
      <Typography component="span" noWrap sx={{ ...LABEL_TEXT, color }}>
        {text}
      </Typography>
    </Box>
  );
};

const Detail = ({ name, value }: { name: string; value: string }) => (
  <Box component="span" sx={{ display: "inline-flex", gap: "0.25rem" }}>
    <Box component="span" sx={{ color: MUTED_TEXT_COLOR }}>
      {name}
    </Box>
    {value}
  </Box>
);

/**
 * One label. Features sharing a comment are one row; differing comments make
 * it a titled block with a row per comment, so each variant is seen.
 */
const LabelEntry = ({ group, shown }: { group: LabelGroup; shown: boolean }) => {
  const [first] = group.variants;
  const single = group.variants.length === 1;
  const rowColor = shown ? LINK_COLOR : MUTED_TEXT_COLOR;

  return (
    <Box component="li" sx={{ padding: "0.25rem 0.5rem 0.25rem 1.5rem", ...LABEL_TEXT }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Bullet category={first.features[0].styleCategory} />
        <Typography
          sx={{ ...LABEL_TEXT, flexGrow: 1, minWidth: 0, color: single ? rowColor : TEXT_COLOR }}
        >
          {group.label}
        </Typography>
        {single && <ComponentFlag flag={first.flag} />}
      </Box>
      {single ? (
        first.comment && (
          <Typography
            sx={{ ...LABEL_TEXT, paddingLeft: "0.75rem", color: SECONDARY_TEXT_COLOR }}
          >
            {first.comment}
          </Typography>
        )
      ) : (
        <Box component="ul" sx={listSx}>
          {group.variants.map(({ comment, flag }) => (
            <Box
              key={comment ?? ""}
              component="li"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.125rem 0 0.125rem 0.75rem",
              }}
            >
              <Typography
                noWrap
                title={comment ?? undefined}
                sx={{ ...LABEL_TEXT, flexGrow: 1, minWidth: 0, color: rowColor }}
              >
                {comment ?? "No comment"}
              </Typography>
              <ComponentFlag flag={flag} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

type SubmissionGroupProps = {
  submission: Submission;
  shown: boolean;
  onToggle: () => void;
};

/** One submission: its header and map toggle, then its components by label. */
export default function SubmissionGroup({
  submission,
  shown,
  onToggle,
}: SubmissionGroupProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const title = submissionTitle(submission);
  const { labels } = submission;
  const collapsible = labels.length > COLLAPSED_LABELS;
  const shownLabels =
    collapsible && !expanded ? labels.slice(0, COLLAPSED_LABELS) : labels;

  return (
    <Box component="li" sx={{ "& + &": { marginTop: "0.5rem" } }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0 0 0.5rem 1.5rem",
        }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography
            component="h5"
            sx={{ ...LABEL_TEXT, fontWeight: 700, color: TEXT_COLOR }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              columnGap: "0.5rem",
              ...LABEL_TEXT,
              color: TEXT_COLOR,
            }}
          >
            <Detail name="Submitted:" value={submissionDate(submission)} />
            <Detail name="Source:" value={submissionSources(submission)} />
          </Box>
        </Box>
        <Switch
          checked={shown}
          onChange={onToggle}
          inputProps={{ "aria-label": `Show ${title} on the map` }}
          sx={{ ...toggleSx(theme), marginRight: "0.5rem" }}
        />
      </Box>
      <Box component="ul" sx={listSx}>
        {shownLabels.map((group) => (
          <LabelEntry key={group.label} group={group} shown={shown} />
        ))}
      </Box>
      {collapsible && (
        <ButtonBase
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          sx={{
            margin: "0.5rem 0 0.5rem 1.5rem",
            ...LABEL_TEXT,
            fontWeight: 700,
            color: LINK_COLOR,
            borderRadius: "0.25rem",
            "&:focus-visible": { outline: `2px solid ${LINK_COLOR}`, outlineOffset: "2px" },
          }}
        >
          {expanded ? "Show fewer" : `Show all ${labels.length} components`}
        </ButtonBase>
      )}
    </Box>
  );
}
