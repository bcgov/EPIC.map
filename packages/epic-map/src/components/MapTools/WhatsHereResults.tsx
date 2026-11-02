import { useState, type MouseEvent } from "react";
import { Box, ButtonBase, CircularProgress, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme } from "@mui/material/styles";
import {
  ACTIVE_FILL,
  FOCUS_RING,
  LINK,
  MENU_SEPARATOR,
  RESULT_ROW_HOVER_FILL,
  SECONDARY_TEXT,
} from "@/components/Filters/filterTokens";
import TertiaryLink from "@/components/Filters/TertiaryLink";
import {
  useSelectArea,
  type ResultFeature,
  type ResultGroup,
} from "@/components/MapTools/SelectAreaContext";

const SMALL_TEXT = { fontSize: "0.75rem", lineHeight: 1.5 } as const;

/** Revealed on a row's hover or focus. */
const ACTIONS_CLASS = "epic-map-result-actions";

const focusRing = {
  "&:focus-visible": { outline: `2px solid ${FOCUS_RING}`, outlineOffset: "-2px" },
} as const;

type RowProps = {
  group: ResultGroup;
  feature: ResultFeature;
  onInfo: (group: ResultGroup, feature: ResultFeature, row: HTMLElement) => void;
};

const ResultRow = ({ group, feature, onInfo }: RowProps) => {
  const theme = useTheme();
  const { focused, focusResult, removeResult } = useSelectArea();
  const selected =
    focused?.kind === "result" &&
    focused.groupKey === group.key &&
    focused.featureKey === feature.key;

  return (
    <Box
      component="li"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        minHeight: "1.875rem",
        padding: "0 0.75rem 0 2rem",
        "&:hover, &:focus-within": { backgroundColor: ACTIVE_FILL },
        [`&:hover .${ACTIONS_CLASS}, &:focus-within .${ACTIONS_CLASS}`]: { opacity: 1 },
      }}
    >
      <ButtonBase
        aria-pressed={selected}
        onClick={() => focusResult(group.key, feature.key)}
        title={feature.name}
        sx={{
          display: "block",
          flexGrow: 1,
          minWidth: 0,
          textAlign: "left",
          ...SMALL_TEXT,
          fontWeight: selected ? 700 : 400,
          color: selected ? theme.palette.primary.main : LINK,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          borderRadius: `${theme.shape.borderRadius}px`,
          ...focusRing,
        }}
      >
        {feature.name}
      </ButtonBase>
      <Box
        className={ACTIONS_CLASS}
        sx={{ display: "flex", opacity: 0, "@media (hover: none)": { opacity: 1 } }}
      >
        <IconButton
          aria-label={`Details of ${feature.name}`}
          onClick={(event: MouseEvent<HTMLElement>) => {
            const row = event.currentTarget.closest("li");
            if (row) onInfo(group, feature, row);
          }}
          sx={{ padding: "0.25rem", color: theme.palette.text.primary }}
        >
          <InfoOutlinedIcon sx={{ fontSize: "1.125rem" }} />
        </IconButton>
        <IconButton
          aria-label={`Remove ${feature.name}`}
          onClick={() => removeResult(group.key, feature.key)}
          sx={{ padding: "0.25rem", color: theme.palette.text.primary }}
        >
          <CloseIcon sx={{ fontSize: "1.125rem" }} />
        </IconButton>
      </Box>
    </Box>
  );
};

const Group = ({
  group,
  onInfo,
}: {
  group: ResultGroup;
  onInfo: RowProps["onInfo"];
}) => {
  const theme = useTheme();
  const { clearGroup } = useSelectArea();
  const [open, setOpen] = useState(true);
  const bodyId = `epic-map-result-${group.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  return (
    <Box component="section">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          backgroundColor: RESULT_ROW_HOVER_FILL,
          borderTop: `1px solid ${MENU_SEPARATOR}`,
          borderBottom: `1px solid ${MENU_SEPARATOR}`,
        }}
      >
        <ButtonBase
          onClick={() => setOpen((shown) => !shown)}
          aria-expanded={open}
          aria-controls={bodyId}
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            flexGrow: 1,
            minWidth: 0,
            textAlign: "left",
            borderRadius: `${theme.shape.borderRadius}px`,
            ...focusRing,
          }}
        >
          <ExpandMoreIcon
            aria-hidden
            sx={{
              flexShrink: 0,
              fontSize: "1.25rem",
              color: theme.palette.text.primary,
              transform: open ? "none" : "rotate(-90deg)",
              transition: "transform 150ms",
            }}
          />
          <Typography
            component="h3"
            sx={{ ...SMALL_TEXT, fontWeight: 700, color: theme.palette.text.primary }}
          >
            {group.name}{" "}
            <Box component="span" sx={{ fontWeight: 400, color: SECONDARY_TEXT }}>
              ({group.features.length})
            </Box>
          </Typography>
        </ButtonBase>
        <TertiaryLink onClick={() => clearGroup(group.key)} aria-label={`Clear ${group.name}`}>
          Clear
        </TertiaryLink>
      </Box>

      {open && (
        <Box id={bodyId} sx={{ padding: "0.5rem 0" }}>
          {group.error ? (
            <Typography sx={{ ...SMALL_TEXT, padding: "0 1rem 0 2rem", color: SECONDARY_TEXT }}>
              {group.error}
            </Typography>
          ) : (
            <Box component="ul" sx={{ margin: 0, padding: 0, listStyle: "none" }}>
              {group.features.map((feature) => (
                <ResultRow key={feature.key} group={group} feature={feature} onInfo={onInfo} />
              ))}
            </Box>
          )}
          {group.matched > group.listed && (
            <Typography sx={{ ...SMALL_TEXT, padding: "0.25rem 1rem 0 2rem", color: SECONDARY_TEXT }}>
              Only the first {group.listed} of {group.matched} are listed.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

/** "Selected from layers": the results, grouped by layer. */
export default function WhatsHereResults({ onInfo }: { onInfo: RowProps["onInfo"] }) {
  const theme = useTheme();
  const { results, queryId, queryError } = useSelectArea();

  if (!results && queryId === null && !queryError) return null;

  const total = results?.reduce((sum, group) => sum + group.features.length, 0) ?? 0;
  const message = (text: string) => (
    <Typography sx={{ ...SMALL_TEXT, padding: "0 1rem 0.75rem", color: SECONDARY_TEXT }}>
      {text}
    </Typography>
  );

  return (
    <Box component="section" aria-labelledby="epic-map-whats-here" sx={{ borderTop: `1px solid ${MENU_SEPARATOR}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem" }}>
        <Typography
          id="epic-map-whats-here"
          component="h2"
          sx={{ ...SMALL_TEXT, fontWeight: 700, color: theme.palette.primary.main }}
        >
          Selected from layers
        </Typography>
        {results && (
          <Box
            component="span"
            sx={{
              padding: "0 0.5rem",
              ...SMALL_TEXT,
              fontWeight: 700,
              color: theme.palette.primary.main,
              backgroundColor: ACTIVE_FILL,
              borderRadius: `${theme.shape.borderRadius}px`,
            }}
          >
            {total}
          </Box>
        )}
        {queryId !== null && <CircularProgress size="0.875rem" aria-label="Searching" />}
      </Box>

      {queryError && message(queryError)}
      {results?.length === 0 && message("Nothing on the layers you have on is under the selection.")}
      {results?.map((group) => <Group key={group.key} group={group} onInfo={onInfo} />)}
    </Box>
  );
}
