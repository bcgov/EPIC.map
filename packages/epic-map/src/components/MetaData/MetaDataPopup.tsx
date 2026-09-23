import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  attributeLabel,
  attributeValue,
  clampToContainer,
  featureHeading,
  stepFor,
  steppedIndex,
  type MetaDataRow,
  type PopupPlacement,
} from "@/components/MetaData/metaDataUtils";

const ZOOM_HINT_COLOR = "#8A6A01";

const focusRing = (theme: Theme) => ({
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: "-2px",
  },
});

const LIST_ID = "epic-map-metadata-layers";
const optionId = (layerId: string) => `${LIST_ID}-${layerId}`;

type MetaDataPopupProps = {
  placement: PopupPlacement;
  title: string;
  loading: boolean;
  rows: readonly MetaDataRow[];
  selected: MetaDataRow | null;
  /** Whether the selected feature is worth offering to zoom to from here. */
  canZoom: boolean;
  onSelect: (row: MetaDataRow) => void;
  onRetry: (row: MetaDataRow) => void;
  onZoom: (row: MetaDataRow) => void;
  onClose: () => void;
};

/**
 * The floating "what is here" panel a metadata click opens.
 *
 * Presentational: which layers were asked, what they said and which one is
 * selected all come in as props.
 */
export default function MetaDataPopup({
  placement,
  title,
  loading,
  rows,
  selected,
  canZoom,
  onSelect,
  onRetry,
  onZoom,
  onClose,
}: MetaDataPopupProps) {
  const theme = useTheme();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState({
    left: placement.left,
    top: placement.top,
  });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    // The close button is the one thing in the header that is not a handle.
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: position.left,
      top: position.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const popup = popupRef.current;
    const container = popup?.offsetParent as HTMLElement | null;
    if (!start || !popup || !container) return;

    setPosition({
      left: clampToContainer(
        start.left + event.clientX - start.x,
        popup.offsetWidth,
        container.clientWidth,
      ),
      // Only the header has to stay reachable, so it can be dragged back.
      top: clampToContainer(
        start.top + event.clientY - start.y,
        event.currentTarget.offsetHeight,
        container.clientHeight,
      ),
    });
  };

  const endDrag = () => {
    drag.current = null;
  };

  /** Keeps a move inside the map, whichever way it came from. */
  const moveBy = (dx: number, dy: number) => {
    const popup = popupRef.current;
    const container = popup?.offsetParent as HTMLElement | null;
    const header = headerRef.current;
    if (!popup || !container || !header) return;

    setPosition((current) => ({
      left: clampToContainer(
        current.left + dx,
        popup.offsetWidth,
        container.clientWidth,
      ),
      top: clampToContainer(
        current.top + dy,
        header.offsetHeight,
        container.clientHeight,
      ),
    }));
  };

  const onGripKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = stepFor(event.key, event.shiftKey);
    if (!step) return;
    // Otherwise the arrows scroll the popup body instead of moving it.
    event.preventDefault();
    moveBy(step.dx, step.dy);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  const listed = rows.length > 1;

  return (
    <Box
      ref={popupRef}
      role="dialog"
      aria-labelledby="epic-map-metadata-title"
      onKeyDown={onKeyDown}
      sx={{
        position: "absolute",
        left: position.left,
        top: position.top,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        width: placement.width,
        // Past the height it was placed with, the body scrolls rather than the
        // popup running off the bottom of the map.
        maxHeight: `calc(100% - ${position.top}px - 0.5rem)`,
        backgroundColor: theme.palette.background.paper,
        borderRadius: "0.25rem",
        boxShadow: theme.shadows[6],
        overflow: "hidden",
      }}
    >
      <Box
        ref={headerRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          flexShrink: 0,
          padding: "0.5rem 0.5rem 0.5rem 0.75rem",
          backgroundColor: theme.palette.grey[50],
          borderBottom: `1px solid ${theme.palette.divider}`,
          cursor: "move",
          // Dragging the header must not scroll the page or select text.
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <Box
          component="button"
          type="button"
          onKeyDown={onGripKeyDown}
          aria-label="Move this panel. Use the arrow keys, or hold shift to move further."
          sx={{
            display: "inline-flex",
            padding: 0,
            border: "none",
            background: "none",
            color: theme.palette.text.secondary,
            cursor: "move",
            ...focusRing(theme),
          }}
        >
          <DragIndicatorIcon aria-hidden sx={{ fontSize: "1.125rem" }} />
        </Box>
        <Typography
          id="epic-map-metadata-title"
          component="h2"
          aria-live="polite"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: theme.typography.body2.fontSize,
            fontWeight: theme.typography.fontWeightBold,
            color: theme.palette.text.primary,
          }}
        >
          {title}
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          data-no-drag
          aria-label="Close"
          sx={{
            padding: "0.25rem",
            color: theme.palette.text.primary,
            ...focusRing(theme),
          }}
        >
          <CloseIcon sx={{ fontSize: "1.125rem" }} />
        </IconButton>
      </Box>

      <Box sx={{ overflowY: "auto", minHeight: 0 }}>
        {loading ? (
          <LoadingSkeleton />
        ) : rows.length === 0 ? (
          <Typography
            sx={{
              padding: "1rem",
              fontSize: theme.typography.body2.fontSize,
              lineHeight: 1.5,
              color: theme.palette.text.secondary,
            }}
          >
            No feature at this point in the enabled layers. Click inside a
            coloured area, or zoom in for finer detail.
          </Typography>
        ) : (
          <>
            {listed && (
              <LayerList rows={rows} selected={selected} onSelect={onSelect} />
            )}
            {selected && (
              <Detail
                row={selected}
                canZoom={canZoom}
                onRetry={onRetry}
                onZoom={onZoom}
              />
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

function LoadingSkeleton() {
  return (
    <Box aria-hidden sx={{ padding: "1rem" }}>
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="text" width="70%" sx={{ fontSize: "1.25rem" }} />
      {[0, 1, 2, 3].map((line) => (
        <Box key={line} sx={{ display: "flex", gap: "1rem" }}>
          <Skeleton variant="text" width="35%" />
          <Skeleton variant="text" width="45%" />
        </Box>
      ))}
    </Box>
  );
}

/**
 * The layers that answered, as a single-select listbox: click a row, or focus
 * the list and step through it with the arrow keys. Selecting is the only thing
 * a row does, so it has no chevron.
 */
function LayerList({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly MetaDataRow[];
  selected: MetaDataRow | null;
  onSelect: (row: MetaDataRow) => void;
}) {
  const theme = useTheme();
  const optionRefs = useRef(new Map<string, HTMLLIElement>());

  const selectedIndex = rows.findIndex(
    (row) => row.layer.id === selected?.layer.id,
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const next = steppedIndex(event.key, Math.max(selectedIndex, 0), rows.length);
    if (next === null) return;
    event.preventDefault();
    const row = rows[next];
    if (next !== selectedIndex) onSelect(row);
    optionRefs.current.get(row.layer.id)?.focus();
  };

  return (
    <Box
      component="ul"
      id={LIST_ID}
      role="listbox"
      aria-label="Layers at this point"
      onKeyDown={onKeyDown}
      sx={{
        // Pinned to the top of the scrolling body, so a long attribute list
        // scrolls under the layers rather than taking them off screen: the
        // user can switch layers without first scrolling back up.
        position: "sticky",
        top: 0,
        zIndex: 1,
        margin: 0,
        padding: "0.25rem 0",
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {rows.map((row) => {
        const isSelected = row.layer.id === selected?.layer.id;
        const failed = row.status === "error";
        return (
          <Box
            component="li"
            key={row.layer.id}
            id={optionId(row.layer.id)}
            ref={(element: HTMLLIElement | null) => {
              if (element) optionRefs.current.set(row.layer.id, element);
              else optionRefs.current.delete(row.layer.id);
            }}
            role="option"
            aria-selected={isSelected}
            // Roving: Tab lands on the selection, the arrows do the rest.
            tabIndex={isSelected ? 0 : -1}
            onClick={() => {
              if (!isSelected) onSelect(row);
            }}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              padding: "0.5rem 1rem 0.5rem 0.75rem",
              listStyle: "none",
              cursor: "pointer",
              borderLeft: `4px solid ${
                isSelected ? theme.palette.primary.main : "transparent"
              }`,
              backgroundColor: isSelected
                ? theme.palette.grey[50]
                : "transparent",
              "&:hover": { backgroundColor: theme.palette.grey[100] },
              ...focusRing(theme),
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  // A long layer name wraps; it is never cut short.
                  overflowWrap: "anywhere",
                  fontSize: theme.typography.body2.fontSize,
                  lineHeight: 1.4,
                  fontWeight: isSelected
                    ? theme.typography.fontWeightBold
                    : theme.typography.fontWeightRegular,
                  color: theme.palette.primary.dark,
                }}
              >
                {row.layer.name}
              </Typography>
              {failed && (
                <Typography
                  component="span"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    marginTop: "0.125rem",
                    fontSize: theme.typography.caption.fontSize,
                    color: theme.palette.error.main,
                  }}
                >
                  {row.retrying ? (
                    <CircularProgress size="0.75rem" color="inherit" aria-hidden />
                  ) : (
                    <ErrorOutlineIcon aria-hidden sx={{ fontSize: "0.875rem" }} />
                  )}
                  {row.retrying ? "Retrying…" : "Did not respond"}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function Detail({
  row,
  canZoom,
  onRetry,
  onZoom,
}: {
  row: MetaDataRow;
  canZoom: boolean;
  onRetry: (row: MetaDataRow) => void;
  onZoom: (row: MetaDataRow) => void;
}) {
  const theme = useTheme();

  if (row.status === "error") {
    return (
      <Box sx={{ padding: "0.75rem 1rem 1rem" }} role="alert">
        <Typography
          component="h3"
          sx={{
            fontSize: "1rem",
            lineHeight: 1.4,
            fontWeight: theme.typography.fontWeightBold,
            color: theme.palette.primary.main,
            overflowWrap: "anywhere",
          }}
        >
          {row.layer.name}
        </Typography>
        <Typography
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.5rem",
            fontSize: theme.typography.body2.fontSize,
            color: theme.palette.text.primary,
          }}
        >
          <ErrorOutlineIcon
            aria-hidden
            sx={{ fontSize: "1.25rem", color: theme.palette.error.main }}
          />
          This layer did not respond.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onRetry(row)}
          disabled={row.retrying}
          startIcon={
            row.retrying ? <CircularProgress size="0.875rem" aria-hidden /> : null
          }
          sx={{ marginTop: "0.75rem", marginLeft: "1.75rem" }}
        >
          {row.retrying ? "Retrying…" : "Retry"}
        </Button>
      </Box>
    );
  }

  const { feature } = row;
  if (!feature) return null;

  const heading = featureHeading(row);

  const labelSx = {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.4,
    color: theme.palette.text.disabled,
    overflowWrap: "anywhere",
  } as const;

  return (
    <Box sx={{ padding: "0.75rem 1rem 1rem" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <Typography
          component="h3"
          sx={{
            fontSize: "1rem",
            lineHeight: 1.4,
            fontWeight: theme.typography.fontWeightBold,
            color: theme.palette.primary.main,
            overflowWrap: "anywhere",
          }}
        >
          {heading}
        </Typography>

        {canZoom && (
          <Box
            component="button"
            type="button"
            onClick={() => onZoom(row)}
            aria-label={`Zoom in to view ${heading}`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              flexShrink: 0,
              // Sits on the heading's first line rather than its middle.
              marginTop: "0.125rem",
              padding: 0,
              border: "none",
              background: "none",
              font: "inherit",
              fontSize: theme.typography.caption.fontSize,
              whiteSpace: "nowrap",
              color: ZOOM_HINT_COLOR,
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" },
              ...focusRing(theme),
            }}
          >
            <ZoomInIcon aria-hidden sx={{ fontSize: "0.875rem" }} />
            Zoom in to view
          </Box>
        )}
      </Box>

      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
          columnGap: "1rem",
          rowGap: "0.5rem",
          margin: "0.5rem 0 0",
        }}
      >
        {feature.properties.map(({ name, value }) => (
          <Box key={name} sx={{ display: "contents" }}>
            <Typography component="dt" sx={labelSx}>
              {attributeLabel(name)}
            </Typography>
            <Typography
              component="dd"
              sx={{ ...labelSx, margin: 0, color: theme.palette.text.primary }}
            >
              {attributeValue(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
