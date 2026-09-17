import { useEffect, useRef, useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useTheme, type Theme } from "@mui/material/styles";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import HighlightedName from "@/components/Layers/HighlightedName";
import LayerInfo from "@/components/Layers/LayerInfo";
import { useLayers } from "@/components/Layers/LayersContext";
import { MAX_VISIBLE_LAYERS } from "@/utils/config";

/** Every control in the row shows the same ring, so tabbing is easy to follow. */
const focusRing = (theme: Theme) => ({
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: "-2px",
  },
});

/**
 * A wide track with a large outlined thumb that overhangs it, per the design.
 * MUI's own switch is smaller and fills its thumb, so every part is restyled.
 */
const toggleSx = (theme: Theme) => ({
  width: "2.5rem",
  height: "1.25rem",
  padding: 0,
  flexShrink: 0,
  overflow: "visible",
  marginLeft: 0.5,
  "& .MuiSwitch-switchBase": {
    padding: 0,
    // Centres the oversized thumb on the track's end.
    margin: "-0.125rem",
    transitionDuration: "200ms",
    "&.Mui-checked": {
      transform: "translateX(1.25rem)",
      "& + .MuiSwitch-track": {
        backgroundColor: theme.palette.primary.main,
        opacity: 1,
      },
      "& .MuiSwitch-thumb": { borderColor: theme.palette.primary.main },
    },
    "&.Mui-focusVisible .MuiSwitch-thumb": {
      boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
    },
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    width: "1.5rem",
    height: "1.5rem",
    boxShadow: "none",
    backgroundColor: theme.palette.common.white,
    border: `2px solid ${theme.palette.grey[600]}`,
  },
  "& .MuiSwitch-track": {
    borderRadius: "0.625rem",
    backgroundColor: theme.palette.grey[300],
    opacity: 1,
  },
});

type LayerRowProps = {
  layer: CatalogueLayer;
  /** Highlighted within the name. Pass "" outside a search context. */
  query?: string;
};

/**
 * One layer in the panel: visibility toggle, name, star, actions menu, expand
 * chevron.
 *
 * Shared by the catalogue results and Favourites. The catalogue has no drag
 * handle - reordering belongs to Favourites, and lands with that ticket.
 */
export default function LayerRow({ layer, query = "" }: LayerRowProps) {
  const theme = useTheme();
  const {
    visibleIds,
    favourites,
    favouritePendingIds,
    expandedId,
    pendingIds,
    atVisibleLimit,
    toggleVisible,
    toggleFavourite,
    toggleExpanded,
  } = useLayers();

  // Expansion is shared state: opening this row closes whichever was open,
  // including one in another section.
  const expanded = expandedId === layer.id;
  const infoId = `${layer.id}-info`;

  const visible = visibleIds.has(layer.id);
  const starred = favourites.some((favourite) => favourite.id === layer.id);

  const unmappable = !layer.objectName;

  const saving = pendingIds.has(layer.id);

  const starSaving = favouritePendingIds.has(layer.id);

  // The API stores an object name, so a dataset with none cannot be starred.
  const starNote = unmappable
    ? "This dataset publishes no mappable layer"
    : starred
    ? "Remove from favourites"
    : "Add to favourites";

  const blockedByLimit = !visible && !unmappable && atVisibleLimit;
  const toggleNote = unmappable
    ? "This dataset publishes no mappable layer"
    : blockedByLimit
    ? `Switch a layer off first: up to ${MAX_VISIBLE_LAYERS} can be shown at once`
    : "";

  const toggle = (
    <Switch
      checked={visible}
      onChange={() => toggleVisible(layer)}
      disabled={unmappable || blockedByLimit || saving}
      inputProps={{ "aria-label": `Show ${layer.name} on the map` }}
      sx={toggleSx(theme)}
    />
  );

  // The tooltip is only useful where the clamp actually cut the name off.
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const element = nameRef.current;
    if (element) setClamped(element.scrollHeight > element.clientHeight + 1);
  }, [layer.name, query]);

  const name = (
    <Box
      component="button"
      type="button"
      onClick={() => toggleExpanded(layer.id)}
      aria-expanded={expanded}
      aria-controls={infoId}
      sx={{
        display: "block",
        width: "100%",
        padding: 0,
        border: "none",
        background: "none",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        ...focusRing(theme),
      }}
    >
      <Typography
        ref={nameRef}
        component="span"
        sx={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontSize: theme.typography.body2.fontSize,
          lineHeight: 1.4,
          color: theme.palette.primary.dark,
        }}
      >
        <HighlightedName text={layer.name} query={query} />
      </Typography>
    </Box>
  );

  return (
    <Box component="li" sx={{ listStyle: "none" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.25rem 1rem",
          "&:hover": { backgroundColor: theme.palette.grey[50] },
        }}
      >
        {toggleNote ? (
          <Tooltip title={toggleNote}>
            <Box component="span" sx={{ display: "inline-flex" }}>
              {toggle}
            </Box>
          </Tooltip>
        ) : (
          toggle
        )}

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {clamped ? <Tooltip title={layer.name}>{name}</Tooltip> : name}
        </Box>

        <Tooltip title={starNote}>
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton
              size="small"
              onClick={() => toggleFavourite(layer)}
              disabled={unmappable || starSaving}
              aria-pressed={starred}
              aria-label={
                starred
                  ? `Remove ${layer.name} from favourites`
                  : `Add ${layer.name} to favourites`
              }
              sx={{
                flexShrink: 0,
                padding: "0.125rem",
                color: theme.palette.secondary.main,
                ...focusRing(theme),
              }}
            >
              {starred ? (
                <StarIcon sx={{ fontSize: "1.25rem" }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: "1.25rem" }} />
              )}
            </IconButton>
          </Box>
        </Tooltip>

        <IconButton
          size="small"
          aria-label={`Actions for ${layer.name}`}
          sx={{
            flexShrink: 0,
            padding: "0.125rem",
            color: theme.palette.text.primary,
            ...focusRing(theme),
          }}
        >
          <MoreVertIcon sx={{ fontSize: "1.25rem" }} />
        </IconButton>

        <IconButton
          size="small"
          onClick={() => toggleExpanded(layer.id)}
          aria-expanded={expanded}
          aria-controls={infoId}
          aria-label={`Layer details for ${layer.name}`}
          sx={{
            flexShrink: 0,
            padding: "0.125rem",
            color: theme.palette.text.primary,
            transition: theme.transitions.create("transform"),
            transform: expanded ? "rotate(180deg)" : "none",
            ...focusRing(theme),
          }}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: "1.25rem" }} />
        </IconButton>
      </Box>

      <Collapse in={expanded} id={infoId}>
        <LayerInfo layer={layer} />
      </Collapse>
    </Box>
  );
}
