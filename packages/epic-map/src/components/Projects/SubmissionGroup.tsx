import { type ReactNode, useState } from "react";
import { Box, ButtonBase, IconButton, Switch, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EditNoteIcon from "@mui/icons-material/EditNote";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import WarningIcon from "@mui/icons-material/Warning";
import { ACTIVE_FILL } from "@/components/Filters/filterTokens";
import { rowIconButtonSx, toggleSx } from "@/components/Layers/LayerRow";
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
      backgroundColor:
        BULLET_COLORS[category] ?? BULLET_COLORS.project_component,
    }}
  />
);

const ComponentFlag = ({ flag }: { flag: Flag | null }) => {
  if (!flag) return null;
  const { text, color, Icon } = FLAGS[flag];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        flexShrink: 0,
        color,
      }}
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

export interface ComponentControls {
  isShown: (featureIds: readonly string[]) => boolean;
  setShown: (featureIds: readonly string[], shown: boolean) => void;
  selectedKey: string | null;
  select: (variantKey: string) => void;
}

const EYE_CLASS = "epic-map-component-eye";

/** A line with an eye: the eye shows on hover or focus, and stays while hidden. */
const rowSx = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  borderRadius: "0.25rem",
  "&:hover": { backgroundColor: ACTIVE_FILL },
  [`&:hover .${EYE_CLASS}, &:focus-within .${EYE_CLASS}`]: { opacity: 1 },
} as const;

const EyeToggle = ({
  name,
  shown,
  onToggle,
}: {
  name: string;
  shown: boolean;
  onToggle: () => void;
}) => {
  const Icon = shown ? VisibilityIcon : VisibilityOffIcon;
  return (
    <IconButton
      className={EYE_CLASS}
      aria-label={`Show ${name} on the map`}
      aria-pressed={shown}
      onClick={onToggle}
      sx={(theme) => ({
        ...rowIconButtonSx(theme),
        padding: "0.125rem",
        color: TEXT_COLOR,
        opacity: shown ? 0 : 1,
      })}
    >
      <Icon sx={{ fontSize: "1rem" }} />
    </IconButton>
  );
};

type SelectableProps = {
  selected: boolean;
  shown: boolean;
  onSelect: () => void;
  children: ReactNode;
};

/** The clickable text of a component, selecting it. */
const Selectable = ({
  selected,
  shown,
  onSelect,
  children,
}: SelectableProps) => (
  <ButtonBase
    aria-pressed={selected}
    onClick={onSelect}
    sx={{
      display: "block",
      flexGrow: 1,
      minWidth: 0,
      textAlign: "left",
      ...LABEL_TEXT,
      fontWeight: selected ? 700 : 400,
      color: shown
        ? selected
          ? "primary.main"
          : LINK_COLOR
        : MUTED_TEXT_COLOR,
      borderRadius: "0.25rem",
      "&:focus-visible": {
        outline: `2px solid ${LINK_COLOR}`,
        outlineOffset: "-2px",
      },
    }}
  >
    {children}
  </ButtonBase>
);

type LabelEntryProps = {
  group: LabelGroup;
  /** Whether its submission is switched on. */
  submissionShown: boolean;
  controls: ComponentControls;
};

/**
 * One label. Features sharing a comment are one row; differing comments make
 * it a titled block with a row per comment, so each variant is seen.
 */
const LabelEntry = ({ group, submissionShown, controls }: LabelEntryProps) => {
  const [first] = group.variants;
  const single = group.variants.length === 1;
  const labelShown = controls.isShown(group.featureIds);
  const toggleLabel = () => controls.setShown(group.featureIds, !labelShown);

  return (
    <Box component="li" sx={{ padding: "0.125rem 0.5rem 0.125rem 1.5rem" }}>
      <Box sx={{ ...rowSx, padding: "0.125rem 0" }}>
        <Bullet category={first.features[0].styleCategory} />
        {single ? (
          <Selectable
            selected={controls.selectedKey === first.key}
            shown={submissionShown && labelShown}
            onSelect={() => controls.select(first.key)}
          >
            <span>{group.label}</span>
            {first.comment && (
              <Box
                component="span"
                sx={{
                  display: "block",
                  fontWeight: 400,
                  color: SECONDARY_TEXT_COLOR,
                }}
              >
                {first.comment}
              </Box>
            )}
          </Selectable>
        ) : (
          <Typography
            sx={{ ...LABEL_TEXT, flexGrow: 1, minWidth: 0, color: TEXT_COLOR }}
          >
            {group.label}
          </Typography>
        )}
        {single && <ComponentFlag flag={first.flag} />}
        <EyeToggle
          name={group.label}
          shown={labelShown}
          onToggle={toggleLabel}
        />
      </Box>
      {!single && (
        <Box component="ul" sx={listSx}>
          {group.variants.map((variant) => {
            const shown = controls.isShown(variant.featureIds);
            const text = variant.comment ?? "No comment";
            return (
              <Box
                key={variant.key}
                component="li"
                sx={{ ...rowSx, padding: "0.125rem 0 0.125rem 0.75rem" }}
              >
                <Selectable
                  selected={controls.selectedKey === variant.key}
                  shown={submissionShown && shown}
                  onSelect={() => controls.select(variant.key)}
                >
                  <Box
                    component="span"
                    title={variant.comment ?? undefined}
                    sx={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {text}
                  </Box>
                </Selectable>
                <ComponentFlag flag={variant.flag} />
                <EyeToggle
                  name={`${group.label}: ${text}`}
                  shown={shown}
                  onToggle={() => controls.setShown(variant.featureIds, !shown)}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

type SubmissionGroupProps = {
  submission: Submission;
  shown: boolean;
  onToggle: () => void;
  controls: ComponentControls;
};

/** One submission: its header and map toggle, then its components by label. */
export default function SubmissionGroup({
  submission,
  shown,
  onToggle,
  controls,
}: SubmissionGroupProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const title = submissionTitle(submission);
  const { labels } = submission;
  const collapsible = labels.length > COLLAPSED_LABELS;
  // A selected component stays in view when the rest collapse.
  const shownLabels =
    collapsible && !expanded
      ? labels.filter(
          ({ variants }, index) =>
            index < COLLAPSED_LABELS ||
            variants.some(({ key }) => key === controls.selectedKey),
        )
      : labels;

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
          <LabelEntry
            key={group.label}
            group={group}
            submissionShown={shown}
            controls={controls}
          />
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
            "&:focus-visible": {
              outline: `2px solid ${LINK_COLOR}`,
              outlineOffset: "2px",
            },
          }}
        >
          {expanded ? "Show fewer" : `Show all ${labels.length} components`}
        </ButtonBase>
      )}
    </Box>
  );
}
