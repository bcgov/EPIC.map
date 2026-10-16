import {
  Fragment,
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  attributeValue,
  clampToContainer,
  featureHeading,
  NO_ATTRIBUTES,
  selectableOptions,
  stepFor,
  steppedIndex,
  type MetaDataFeatureEntry,
  type MetaDataOption,
  type MetaDataRecord,
  type MetaDataRow,
  type PopupPlacement,
} from "@/components/MetaData/metaDataUtils";
import { recordNoun } from "@/utils/localLayers";

const ZOOM_HINT_COLOR = "#8A6A01";

/**
 * The feature's name in the detail, which the design calls info blue.
 *
 * A BC design token (support/borderColor/info) rather than anything on the
 * MUI palette: this package is themed by its host and carries no theme of its
 * own, so the few colours the design names outright are written down here.
 */
const DETAIL_TITLE_COLOR = "#053662";

/** How far a layer's name sits in, and how much further its features do. */
const LAYER_INDENT = "1rem";
const FEATURE_INDENT = "1.5rem";

/** The label column of a record, which the design fixes rather than shares out. */
const RECORD_LABEL_WIDTH = "6.5rem";

const focusRing = (theme: Theme) => ({
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: "-2px",
  },
});

/** Identifies one option in the list, for the roving focus. */
const optionKey = (option: MetaDataOption) =>
  `${option.row.layer.id}::${option.feature.key}`;

type MetaDataPopupProps = {
  placement: PopupPlacement;
  title: string;
  loading: boolean;
  rows: readonly MetaDataRow[];
  selected: MetaDataOption | null;
  /** Whether the selected feature is worth offering to zoom to from here. */
  canZoom: boolean;
  onSelect: (option: MetaDataOption) => void;
  /** Ask again for what the selected row could not fetch. */
  onRetry: (option: MetaDataOption) => void;
  onZoom: (option: MetaDataOption) => void;
  onClose: () => void;
};

/**
 * The floating "what is here" panel a click opens.
 *
 * Three levels, because that is what a click lands on: the layer, the features
 * of it under the pointer, and the records attached to a feature. Most features
 * carry one record and the third level never shows; a consultation area carries
 * one per nation, and the pager is how they are read.
 *
 * Presentational: which layers were asked, what they said and which feature is
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
    // Primary button only: a right-click opens a menu, and capturing the
    // pointer for it would leave the popup following a button nobody is holding.
    if (event.button !== 0) return;
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
        {rows.length === 0 ? (
          loading ? (
            <LoadingSkeleton />
          ) : (
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
          )
        ) : (
          <>
            <FeatureList rows={rows} selected={selected} onSelect={onSelect} />
            {selected && (
              <FeatureDetail
                option={selected}
                canZoom={canZoom}
                onZoom={onZoom}
                onRetry={onRetry}
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
 * What the click landed on: a row per layer, and under a layer with more than
 * one feature here, a row per feature.
 *
 * A single-select listbox over the features: click a row, or focus the list and
 * step through it with the arrow keys. A layer that has several features is a
 * heading rather than an option - selecting "the layer" would not say which of
 * its shapes was meant.
 */
function FeatureList({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly MetaDataRow[];
  selected: MetaDataOption | null;
  onSelect: (option: MetaDataOption) => void;
}) {
  const theme = useTheme();
  const optionRefs = useRef(new Map<string, HTMLElement>());

  const options = selectableOptions(rows);
  const selectedIndex = selected
    ? options.findIndex((option) => optionKey(option) === optionKey(selected))
    : -1;

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const next = steppedIndex(
      event.key,
      Math.max(selectedIndex, 0),
      options.length,
    );
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (next !== selectedIndex) onSelect(option);
    optionRefs.current.get(optionKey(option))?.focus();
  };

  const register = (key: string) => (element: HTMLElement | null) => {
    if (element) optionRefs.current.set(key, element);
    else optionRefs.current.delete(key);
  };

  return (
    <Box
      component="ul"
      role="listbox"
      aria-label="Features at this point"
      onKeyDown={onKeyDown}
      sx={{
        // Pinned to the top of the scrolling body, so a long attribute list
        // scrolls under the layers rather than taking them off screen: the
        // user can switch features without first scrolling back up.
        position: "sticky",
        top: 0,
        zIndex: 1,
        margin: 0,
        padding: 0,
        backgroundColor: theme.palette.grey[50],
      }}
    >
      {rows.map((row) => {
        // One feature, so the layer's own row is what selects it: a row of its
        // own underneath would say the same thing twice.
        const lone = row.features.length === 1 ? row.features[0] : null;
        const option = lone ? { row, feature: lone } : null;
        const key = option ? optionKey(option) : row.layer.id;

        return (
          <Fragment key={row.layer.id}>
            <LayerRow
              row={row}
              option={option}
              selected={Boolean(
                option && selected && optionKey(option) === optionKey(selected),
              )}
              innerRef={register(key)}
              onSelect={onSelect}
            />

            {row.features.length > 1 &&
              row.features.map((feature) => {
                const featureOption = { row, feature };
                return (
                  <FeatureRow
                    key={feature.key}
                    option={featureOption}
                    selected={Boolean(
                      selected &&
                        optionKey(featureOption) === optionKey(selected),
                    )}
                    innerRef={register(optionKey(featureOption))}
                    onSelect={onSelect}
                  />
                );
              })}
          </Fragment>
        );
      })}
    </Box>
  );
}

/** The shared look of a row in the list, selected or not. */
const rowSx = (theme: Theme, indent: string, selected: boolean) => ({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.5rem",
  padding: `0.5rem 0.5rem 0.5rem ${indent}`,
  listStyle: "none",
  borderTop: `1px solid ${theme.palette.divider}`,
  // Inset rather than a border, so the selected row's text does not step
  // sideways by the width of its own accent.
  boxShadow: selected
    ? `inset 2px 0 0 0 ${theme.palette.primary.main}`
    : "none",
  backgroundColor: selected
    ? theme.palette.background.paper
    : theme.palette.grey[50],
  ...focusRing(theme),
});

const nameSx = (theme: Theme, selected: boolean) => ({
  display: "block",
  // A long name wraps; it is never cut short.
  overflowWrap: "anywhere" as const,
  fontSize: theme.typography.body2.fontSize,
  lineHeight: 1.5,
  fontWeight: selected
    ? theme.typography.fontWeightBold
    : theme.typography.fontWeightRegular,
  color: theme.palette.text.secondary,
});

/**
 * One layer at the click point.
 *
 * Three jobs in one row, which is the point of it: it selects the feature where
 * the layer has exactly one, it heads the list where the layer has several, and
 * it carries the Retry where the layer could not answer at all.
 */
function LayerRow({
  row,
  option,
  selected,
  innerRef,
  onSelect,
}: {
  row: MetaDataRow;
  /** The one feature this row selects, or null for a heading. */
  option: MetaDataOption | null;
  selected: boolean;
  innerRef: (element: HTMLElement | null) => void;
  onSelect: (option: MetaDataOption) => void;
}) {
  const theme = useTheme();
  const failed = row.status === "error";

  return (
    <Box
      component="li"
      ref={innerRef}
      {...(option
        ? {
            role: "option",
            "aria-selected": selected,
            // Roving: Tab lands on the selection, the arrows do the rest.
            tabIndex: selected ? 0 : -1,
            onClick: () => {
              if (!selected) onSelect(option);
            },
          }
        : // A heading is not an option, so it is not in the listbox's tab order
          // and reads as the group label it is.
          { role: "presentation" })}
      sx={{
        ...rowSx(theme, LAYER_INDENT, selected),
        cursor: option ? "pointer" : "default",
        ...(option && {
          "&:hover": { backgroundColor: theme.palette.grey[100] },
        }),
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography component="span" sx={nameSx(theme, selected)}>
          {row.layer.name}
        </Typography>
      </Box>

      {/* The row says only that this layer could not answer; selecting it is
          what shows why, and the Retry. */}
      {failed && (
        <Box
          component="span"
          aria-label={row.retrying ? "Retrying" : "Did not respond"}
          sx={{
            display: "inline-flex",
            flexShrink: 0,
            color: theme.palette.error.main,
          }}
        >
          {row.retrying ? (
            <CircularProgress size="1rem" color="inherit" aria-hidden />
          ) : (
            <ErrorOutlineIcon aria-hidden sx={{ fontSize: "1rem" }} />
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * One feature of a layer that has several here.
 *
 * Indented past its layer, because what it belongs to is the only thing that
 * tells two overlapping areas apart in a list of their names.
 */
function FeatureRow({
  option,
  selected,
  innerRef,
  onSelect,
}: {
  option: MetaDataOption;
  selected: boolean;
  innerRef: (element: HTMLElement | null) => void;
  onSelect: (option: MetaDataOption) => void;
}) {
  const theme = useTheme();

  return (
    <Box
      component="li"
      ref={innerRef}
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => {
        if (!selected) onSelect(option);
      }}
      sx={{
        ...rowSx(theme, FEATURE_INDENT, selected),
        cursor: "pointer",
        "&:hover": { backgroundColor: theme.palette.grey[100] },
      }}
    >
      <Typography component="span" sx={nameSx(theme, selected)}>
        {option.feature.name}
      </Typography>
    </Box>
  );
}

/**
 * The selected feature: what it is called, how to get to it, and what is
 * recorded against it.
 */
function FeatureDetail({
  option,
  canZoom,
  onZoom,
  onRetry,
}: {
  option: MetaDataOption;
  canZoom: boolean;
  onZoom: (option: MetaDataOption) => void;
  onRetry: (option: MetaDataOption) => void;
}) {
  const theme = useTheme();
  const { feature, row } = option;
  const heading = featureHeading(option);

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
            fontSize: "0.875rem",
            lineHeight: 1.5,
            fontWeight: theme.typography.fontWeightBold,
            color: DETAIL_TITLE_COLOR,
            overflowWrap: "anywhere",
          }}
        >
          {heading}
        </Typography>

        {canZoom && (
          <Box
            component="button"
            type="button"
            onClick={() => onZoom(option)}
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

      <Records
        feature={feature}
        layerFailed={row.status === "error"}
        retrying={row.retrying}
        noun={recordNoun(row.layer.objectName)}
        onRetry={() => onRetry(option)}
      />
    </Box>
  );
}

const labelSx = (theme: Theme) => ({
  fontSize: theme.typography.body2.fontSize,
  lineHeight: 1.4,
  color: theme.palette.text.disabled,
  overflowWrap: "anywhere" as const,
});

/** The records on a feature, one at a time where it has more than one. */
function Records({
  feature,
  layerFailed,
  retrying,
  noun,
  onRetry,
}: {
  feature: MetaDataFeatureEntry;
  /** The whole layer did not answer, rather than this one feature's records. */
  layerFailed: boolean;
  retrying: boolean;
  noun: string;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);

  // The feature changes under this component when the selection moves, and the
  // new one is read from its first record whatever page the last was left on.
  const [shownFor, setShownFor] = useState(feature.key);
  if (shownFor !== feature.key) {
    setShownFor(feature.key);
    setIndex(0);
  }

  if (feature.pending) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "0.75rem",
        }}
      >
        <CircularProgress size="0.875rem" aria-hidden />
        <Typography sx={labelSx(theme)}>Loading the details…</Typography>
      </Box>
    );
  }

  if (feature.failed) {
    return (
      <Box sx={{ marginTop: "0.5rem" }} role="alert">
        <Typography
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: theme.typography.body2.fontSize,
            color: theme.palette.text.primary,
          }}
        >
          <ErrorOutlineIcon
            aria-hidden
            sx={{ fontSize: "1.25rem", color: theme.palette.error.main }}
          />
          {layerFailed
            ? "This layer did not respond."
            : "The details for this feature did not load."}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={onRetry}
          disabled={retrying}
          startIcon={
            retrying ? <CircularProgress size="0.875rem" aria-hidden /> : null
          }
          sx={{ marginTop: "0.75rem", marginLeft: "1.75rem" }}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </Box>
    );
  }

  const { records } = feature;
  if (records.length === 0) {
    return (
      <Typography sx={{ ...labelSx(theme), marginTop: "0.5rem" }}>
        {NO_ATTRIBUTES}
      </Typography>
    );
  }

  const shown = records[Math.min(index, records.length - 1)];

  return (
    <>
      {records.length > 1 && (
        <RecordPager
          noun={noun}
          index={Math.min(index, records.length - 1)}
          count={records.length}
          onChange={setIndex}
        />
      )}
      <Record record={shown} />
    </>
  );
}

/**
 * Which of a feature's records is being read, and the way to the next.
 *
 * One at a time rather than all of them down the page: twelve nations on one
 * area is twelve addresses and twelve phone numbers, and the question being
 * asked is almost always about one of them.
 */
function RecordPager({
  noun,
  index,
  count,
  onChange,
}: {
  noun: string;
  index: number;
  count: number;
  onChange: (index: number) => void;
}) {
  const theme = useTheme();

  // Wraps rather than stopping: the pager is a ring of a feature's records, and
  // a dead chevron at either end reads as a fault rather than an end.
  const step = (by: number) => () => onChange((index + by + count) % count);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5rem",
        marginTop: "0.75rem",
        padding: "0.125rem 0.25rem",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: "0.25rem",
      }}
    >
      <IconButton
        size="small"
        onClick={step(-1)}
        aria-label={`Previous ${noun.toLowerCase()}`}
        sx={{ padding: "0.125rem", ...focusRing(theme) }}
      >
        <ChevronLeftIcon sx={{ fontSize: "1.125rem" }} />
      </IconButton>

      <Typography
        aria-live="polite"
        sx={{
          fontSize: theme.typography.caption.fontSize,
          fontWeight: theme.typography.fontWeightBold,
          color: theme.palette.text.secondary,
        }}
      >
        {noun} {index + 1} of {count}
      </Typography>

      <IconButton
        size="small"
        onClick={step(1)}
        aria-label={`Next ${noun.toLowerCase()}`}
        sx={{ padding: "0.125rem", ...focusRing(theme) }}
      >
        <ChevronRightIcon sx={{ fontSize: "1.125rem" }} />
      </IconButton>
    </Box>
  );
}

/** One record's attributes: label on the left, value on the right. */
function Record({ record }: { record: MetaDataRecord }) {
  const theme = useTheme();

  return (
    <Box
      component="dl"
      sx={{
        display: "grid",
        gridTemplateColumns: `${RECORD_LABEL_WIDTH} minmax(0, 1fr)`,
        columnGap: "0.75rem",
        rowGap: "0.5rem",
        margin: "0.5rem 0 0",
      }}
    >
      {record.attributes.map(({ label, value }) => (
        <Box key={label} sx={{ display: "contents" }}>
          <Typography component="dt" sx={labelSx(theme)}>
            {label}
          </Typography>
          <Typography
            component="dd"
            sx={{
              ...labelSx(theme),
              margin: 0,
              color: theme.palette.text.secondary,
            }}
          >
            {attributeValue(value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
