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
  const { projects: allProjects, types } = useFilters();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const { showAt } = useSearchMarker(map, theme.palette.primary.main);

  // Waits for a pause in typing, so the geocoder is not asked per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query),
      PLACE_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const { places, isLoading } = usePlaceSearch(debouncedQuery);

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

  // An index into a list that just got shorter would highlight nothing, or the
  // wrong row.
  useEffect(() => setActiveIndex(-1), [rows.length]);

  // Nothing is shown below the length the geocoder is asked at. Projects do
  // match on a single character, but a menu open on one would have to either
  // say no places matched — which would be a claim about a search that never
  // ran — or leave the Places group silently absent, which reads the same way.
  const showDropdown = open && searchable;

  const select = (row: SearchRow | undefined) => {
    if (!row) return;

    if (row.kind === "place") {
      showAt(row.place.coordinates, row.place.zoom);
    } else if (row.project.coordinates) {
      showAt(row.project.coordinates, row.project.zoom);
    }

    setOpen(false);
    setActiveIndex(-1);
  };

  const clear = () => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showDropdown) {
        setOpen(true);
        return;
      }
      // Otherwise the caret jumps to either end of the field as the list moves.
      event.preventDefault();
      setActiveIndex((current) =>
        steppedIndex(current, event.key === "ArrowDown" ? 1 : -1, rows.length),
      );
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
          "aria-controls": showDropdown ? listId : undefined,
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
          onSelect={select}
        />
      )}
    </Box>
  );
}
