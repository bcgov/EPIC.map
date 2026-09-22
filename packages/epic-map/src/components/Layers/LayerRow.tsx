import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Collapse,
  IconButton,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CircularProgress from "@mui/material/CircularProgress";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { useTheme, type Theme } from "@mui/material/styles";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import HighlightedName from "@/components/Layers/HighlightedName";
import { setLiftedDragImage } from "@/components/Layers/Favourites/dragImage";
import { startFavouriteDrag } from "@/components/Layers/Favourites/favouriteDrag";
import LayerInfo from "@/components/Layers/LayerInfo";
import { useLayers } from "@/components/Layers/LayersContext";
import { MAX_VISIBLE_LAYERS } from "@/utils/config";

const ZOOM_HINT_COLOR = "#8A6A01";

/** Every control in the row shows the same ring, so tabbing is easy to follow. */
const focusRing = (theme: Theme) => ({
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: "-2px",
  },
});

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
  /** Favourites only: a catalogue result is filed nowhere, so it has no grip. */
  draggable?: boolean;
  /** The kebab's menu. Without one the kebab opens nothing yet. */
  menu?: (controls: {
    id: string;
    anchorEl: HTMLElement | null;
    onClose: () => void;
  }) => ReactNode;
  /** Focus the kebab on mount: the row was just moved from its menu. */
  focusMenuButton?: boolean;
  onMenuButtonFocused?: () => void;
};

/**
 * One layer in the panel: visibility toggle, name, star, actions menu, expand
 * chevron.
 *
 * Shared by the catalogue results and Favourites. Only a Favourites row drags:
 * a catalogue result belongs to no list, so there is nowhere to drop it.
 */
export default function LayerRow({
  layer,
  query = "",
  draggable = false,
  menu,
  focusMenuButton = false,
  onMenuButtonFocused,
}: LayerRowProps) {
  const theme = useTheme();
  const {
    visibleIds,
    favourites,
    favouritePendingIds,
    expandedId,
    pendingIds,
    focusPendingIds,
    focusErrors,
    focusLayer,
    belowFloorIds,
    beyondReachIds,
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

  const focusing = focusPendingIds.has(layer.id);

  // Only worth offering while the layer genuinely cannot draw: past its own
  // published scale openmaps returns a blank tile, and each layer's scale is
  // different, so this is per layer rather than one shared zoom.
  const belowFloor = belowFloorIds.has(layer.id);

  // A floor past the map's own ceiling is one no amount of zooming reaches, so
  // the row says so instead of offering a button that cannot keep its word.
  const beyondReach = beyondReachIds.has(layer.id);

  const focusError = focusErrors[layer.id];

  // Star is pending while the API request is out.
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
  const [dragging, setDragging] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `${layer.id}-menu`;

  // A move remounts the row in its new list, dropping focus on the body.
  useEffect(() => {
    if (!focusMenuButton) return;
    menuButtonRef.current?.focus();
    onMenuButtonFocused?.();
  }, [focusMenuButton, onMenuButtonFocused]);
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

  // The whole row is the drag surface; the grip is the cue, not the handle.
  const dragProps = draggable
    ? {
        draggable: true,
        onDragStart: (event: DragEvent<HTMLDivElement>) => {
          startFavouriteDrag(event.dataTransfer, layer.id);
          setLiftedDragImage(event, {
            background: theme.palette.background.paper,
            boxShadow: theme.shadows[3],
            borderRadius: `${theme.shape.borderRadius}px`,
          });
          // Deferred a frame: restyling the source inside dragstart aborts
          // the drag in some browsers.
          requestAnimationFrame(() => setDragging(true));
        },
        onDragEnd: () => setDragging(false),
      }
    : {};

  const hintSx = {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    marginTop: "0.25rem",
    width: "100%",
    textAlign: "left",
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 1.4,
  } as const;

  // The icon is a flex item like any other, so without this it is the thing
  // that gives way when the column is narrow: it squashes to a sliver and the
  // label wraps around where it used to be.
  const hintIconSx = { flexShrink: 0, fontSize: "0.875rem" } as const;

  const zoomInButton = (
    <Box
      component="button"
      type="button"
      onClick={() => focusLayer(layer)}
      disabled={focusing}
      aria-label={
        focusError
          ? `Zoom in to view ${layer.name}. ${focusError}`
          : `Zoom in to view ${layer.name}`
      }
      sx={{
        ...hintSx,
        padding: 0,
        border: "none",
        background: "none",
        font: "inherit",
        fontSize: theme.typography.caption.fontSize,
        color: focusError ? theme.palette.error.main : ZOOM_HINT_COLOR,
        cursor: focusing ? "default" : "pointer",
        "&:hover": { textDecoration: focusing ? "none" : "underline" },
        ...focusRing(theme),
      }}
    >
      {focusing ? (
        <CircularProgress size="0.875rem" sx={hintIconSx} aria-hidden />
      ) : (
        <ZoomInIcon aria-hidden sx={hintIconSx} />
      )}
      <Typography
        variant="caption"
        component="span"
        sx={{ minWidth: 0, color: "inherit" }}
      >
        Zoom in to view
      </Typography>
    </Box>
  );

  // The button stays pressable after a failure: the warehouse being slow or
  // busy is the usual reason, and a second press is what fixes it.
  const zoomIn = focusError ? (
    <Tooltip title={focusError}>{zoomInButton}</Tooltip>
  ) : (
    zoomInButton
  );

  const unreachableNote = (
    <Tooltip title="This layer only draws closer in than this map can zoom">
      <Typography
        component="span"
        sx={{ ...hintSx, color: ZOOM_HINT_COLOR, cursor: "default" }}
      >
        <ZoomInIcon aria-hidden sx={hintIconSx} />
        <Box component="span" sx={{ minWidth: 0 }}>
          Not visible at any zoom
        </Box>
      </Typography>
    </Tooltip>
  );

  return (
    <Box component="li" sx={{ listStyle: "none" }}>
      <Box
        {...dragProps}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.25rem 1rem",
          cursor: draggable ? "grab" : "default",
          // Lifts off the panel rather than fading: this is the row in hand.
          borderRadius: `${theme.shape.borderRadius}px`,
          ...(dragging && {
            backgroundColor: theme.palette.background.paper,
            boxShadow: theme.shadows[3],
          }),
          "&:hover": { backgroundColor: theme.palette.grey[50] },
          "&:hover .epic-map-grip, &:focus-within .epic-map-grip": {
            opacity: 1,
          },
          "&:hover .epic-map-row-menu, &:focus-within .epic-map-row-menu": {
            opacity: 1,
          },
        }}
      >
        {draggable && (
          <DragIndicatorIcon
            aria-hidden
            className="epic-map-grip"
            sx={{
              flexShrink: 0,
              marginLeft: "-0.5rem",
              fontSize: "1.125rem",
              color: theme.palette.text.disabled,
              // Space is held either way, so the row does not jump on hover.
              opacity: dragging ? 1 : 0,
              transition: theme.transitions.create("opacity"),
            }}
          />
        )}

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

          {visible && belowFloor && (beyondReach ? unreachableNote : zoomIn)}
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
          ref={menuButtonRef}
          size="small"
          aria-label={`Actions for ${layer.name}`}
          className={menu ? "epic-map-row-menu" : undefined}
          onClick={
            menu
              ? (event) => {
                  const button = event.currentTarget;
                  setMenuAnchor((current) => (current ? null : button));
                }
              : undefined
          }
          aria-haspopup={menu ? "menu" : undefined}
          aria-expanded={menu ? Boolean(menuAnchor) : undefined}
          aria-controls={menuAnchor ? menuId : undefined}
          sx={{
            flexShrink: 0,
            padding: "0.125rem",
            color: theme.palette.text.primary,
            // Subtle until the row is hovered or focused, but still tabbable.
            ...(menu && {
              opacity: menuAnchor ? 1 : 0.6,
              transition: theme.transitions.create("opacity"),
            }),
            ...focusRing(theme),
          }}
        >
          <MoreVertIcon sx={{ fontSize: "1.25rem" }} />
        </IconButton>

        {menu?.({
          id: menuId,
          anchorEl: menuAnchor,
          onClose: () => setMenuAnchor(null),
        })}

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
