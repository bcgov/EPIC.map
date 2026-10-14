import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Box, IconButton, InputAdornment, TextField } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap } from "maplibre-gl";
import { usePlaceSearch } from "@/api/usePlaceSearch";
import { useFilters } from "@/components/Filters/FiltersContext";
import SearchDropdown, { rowId } from "@/components/Search/SearchDropdown";
import { useSearchMarker } from "@/components/Search/useSearchMarker";
import {
  matchProjects,
  rowKey,
  steppedIndex,
  toRows,
  type SearchRow,
} from "@/components/Search/searchUtils";
import {
  BORDER_DEFAULT,
  BORDER_DARK,
  CONTROL_HEIGHT,
  DIMMED_TEXT,
  focusRing,
  FOCUS_RING,
  SEARCH_WIDTH,
  SECONDARY_TEXT,
} from "@/components/Filters/filterTokens";
import {
  MIN_PLACE_QUERY_LENGTH,
  PLACE_SEARCH_DEBOUNCE_MS,
} from "@/utils/config";

/**
 * Search for an EAO project or a place, and go to it.
 *
 * Two sources behind one field. Projects are matched in the browser against the
 * list the filter bar already holds, so they appear as the user types; places
 * come from the BC Address Geocoder, debounced, so they arrive a moment later
 * and the dropdown carries both states at once.
 *
 * The field keeps what the user typed when a row is chosen rather than taking
 * the result's name. The query is theirs — "Douglas St" matched four cities, and
 * replacing it with the one that was picked would make going back for a
 * different one a retype rather than a reopen.
 */
export default function MapSearch({ map }: { map: MapLibreMap | null }) {
  const theme = useTheme();
  const { projects: allProjects, visibleProjects, types } = useFilters();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const {
    showAt,
    goTo,
    clear: clearMarker,
  } = useSearchMarker(map, theme.palette.primary.main);

  // Waits for a pause in typing, so the geocoder is not asked per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query),
      PLACE_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const { places, isLoading, error: placesError } = usePlaceSearch(
    debouncedQuery,
  );

  const trimmed = query.trim();
  const projects = useMemo(
    () => matchProjects(allProjects, types, trimmed),
    [allProjects, types, trimmed],
  );

  const rows = useMemo(() => toRows(projects, places), [projects, places]);

  // Whether the places on screen are the ones this query asked for. A query
  // mid-debounce has results from the previous one behind it, which would
  // otherwise read as settled and could put the no-results message under a
  // query still being typed.
  const settled = debouncedQuery.trim() === trimmed;
  const searchable = trimmed.length >= MIN_PLACE_QUERY_LENGTH;
  const loading = searchable && (!settled || isLoading);

  // Only once this query's own request has come back. `error` outlives the
  // query it belongs to, so without the settled check a failure would be
  // reported against the next thing typed as well.
  const placesFailed = searchable && settled && !isLoading && Boolean(placesError);

  /**
   * The active row, held by identity rather than by position.
   *
   * Both sources write into one list at different times: places arrive a
   * debounce after the projects they are listed under, which renumbers nothing
   * above them but everything below. Holding an index would drop the highlight
   * the moment they landed; holding it loosely - resetting only when the row
   * *count* changes - would leave it on whichever row now sits at that number,
   * so Enter would take something the user never highlighted. A key does
   * neither: the row keeps the highlight while it is still in the list, and
   * loses it when it is not.
   */
  const activeIndex = useMemo(
    () =>
      activeKey === null
        ? -1
        : rows.findIndex((row) => rowKey(row) === activeKey),
    [rows, activeKey],
  );

  // Nothing is shown below the length the geocoder is asked at. Projects do
  // match on a single character, but a menu open on one would have to either
  // say no places matched — which would be a claim about a search that never
  // ran — or leave the Places group silently absent, which reads the same way.
  const showDropdown = open && searchable;

  // The dropdown shows a status message instead of a listbox when there is
  // nothing to choose from, so `aria-controls` must not name an element that is
  // not rendered. Matches SearchDropdown's own branch.
  const hasListbox = showDropdown && (rows.length > 0 || loading);

  /** Whether the map is currently drawing this project's dot. */
  const isDrawn = (projectId: number) =>
    visibleProjects.some((project) => project.id === projectId);

  const select = (row: SearchRow | undefined) => {
    if (!row) return;

    if (row.kind === "place") {
      // The geocoder's results belong to no layer, so a place is always pinned.
      showAt(row.place.coordinates, row.place.zoom);
    } else if (isDrawn(row.project.id)) {
      // Its own dot already says where it is.
      goTo(row.project.coordinates, row.project.zoom);
    } else {
      // A filter is hiding it. Projects are searched over the whole list on
      // purpose - being unable to find something a forgotten filter hid is the
      // worst case - so without a pin this would fly to an empty patch of map.
      showAt(row.project.coordinates, row.project.zoom);
    }

    setOpen(false);
    setActiveKey(null);
  };

  const clear = () => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    setActiveKey(null);
    // The pin answers the query being cleared. Left behind it would sit on the
    // map with nothing on screen able to remove it.
    clearMarker();
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveKey(null);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showDropdown) {
        setOpen(true);
        return;
      }
      // Otherwise the caret jumps to either end of the field as the list moves.
      event.preventDefault();
      const next = steppedIndex(
        activeIndex,
        event.key === "ArrowDown" ? 1 : -1,
        rows.length,
      );
      setActiveKey(next === -1 ? null : rowKey(rows[next]));
      return;
    }

    if (event.key === "Enter" && showDropdown && activeIndex >= 0) {
      event.preventDefault();
      select(rows[activeIndex]);
    }
  };

  return (
    <Box sx={{ position: "relative", width: SEARCH_WIDTH, flexShrink: 0 }}>
      <TextField
        fullWidth
        inputRef={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search projects and places…"
        // A combobox over a listbox the field does not contain, which is what
        // `aria-controls` and `aria-activedescendant` are for: focus stays in
        // the input while the active row moves, so a screen reader announces
        // the row without the user ever leaving what they are typing.
        inputProps={{
          role: "combobox",
          "aria-expanded": showDropdown,
          "aria-controls": hasListbox ? listId : undefined,
          "aria-activedescendant":
            showDropdown && activeIndex >= 0
              ? rowId(listId, activeIndex)
              : undefined,
          "aria-autocomplete": "list",
          "aria-label": "Search projects and places",
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {query && (
                <IconButton
                  size="small"
                  aria-label="Clear search"
                  // Keeps the blur that would otherwise close the dropdown and
                  // swallow the click before it lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clear}
                  sx={{ marginRight: "0.25rem", padding: 0 }}
                >
                  <CancelIcon
                    sx={{ fontSize: "1.25rem", color: SECONDARY_TEXT }}
                  />
                </IconButton>
              )}
              <SearchIcon
                aria-hidden
                sx={{ fontSize: "1.25rem", color: "text.primary" }}
              />
            </InputAdornment>
          ),
        }}
        sx={{
          marginBottom: 0,
          "& .MuiOutlinedInput-root": {
            height: CONTROL_HEIGHT,
            paddingRight: "0.75rem",
            borderRadius: `${theme.shape.borderRadius}px`,
            fontSize: theme.typography.body2.fontSize,
            "& fieldset": { borderColor: BORDER_DEFAULT },
            "&:hover fieldset": { borderColor: BORDER_DARK },
            "&.Mui-focused fieldset": {
              // One pixel at every state, so focus recolours the border rather
              // than thickening it and nudging the text.
              borderWidth: "1px",
              borderColor: FOCUS_RING,
            },
            // The ring the design puts outside the blue border. Hung off the
            // input's own :focus-visible, since that is the element focus
            // lands on and the root is only its wrapper.
            "&:has(:focus-visible)": focusRing["&:focus-visible"],
          },
          "& .MuiOutlinedInput-input": {
            padding: "0 0 0 1rem",
            "&::placeholder": { color: DIMMED_TEXT, opacity: 1 },
          },
        }}
      />

      {showDropdown && (
        <SearchDropdown
          listId={listId}
          query={trimmed}
          projects={projects}
          places={places}
          rows={rows}
          activeIndex={activeIndex}
          loading={loading}
          placesFailed={placesFailed}
          onSelect={select}
        />
      )}
    </Box>
  );
}
