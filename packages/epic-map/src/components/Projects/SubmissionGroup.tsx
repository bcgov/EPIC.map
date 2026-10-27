import { Box, Switch, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { toggleSx } from "@/components/Layers/LayerRow";
import {
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
          sx={{ ...LABEL_TEXT, color: single ? rowColor : TEXT_COLOR }}
        >
          {group.label}
        </Typography>
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
          {group.variants.map(({ comment }) => (
            <Typography
              key={comment ?? ""}
              component="li"
              noWrap
              title={comment ?? undefined}
              sx={{ ...LABEL_TEXT, padding: "0.125rem 0 0.125rem 0.75rem", color: rowColor }}
            >
              {comment ?? "No comment"}
            </Typography>
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
  const title = submissionTitle(submission);

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
        {submission.labels.map((group) => (
          <LabelEntry key={group.label} group={group} shown={shown} />
        ))}
      </Box>
    </Box>
  );
}
