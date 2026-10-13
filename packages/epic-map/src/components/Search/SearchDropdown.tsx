import { Box, CircularProgress, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { PlaceRow, ProjectRow } from "@/components/Search/SearchResultRow";
import type {
  PlaceResult,
  ProjectResult,
  SearchRow,
} from "@/components/Search/searchUtils";
import {
  MENU_SEPARATOR,
  MENU_SHADOW,
  SEARCH_MENU_MAX_HEIGHT,
  SECONDARY_TEXT,
  SECTION_HEADER,
} from "@/components/Filters/filterTokens";

/** The id of one row, so `aria-activedescendant` can name it. */
export const rowId = (listId: string, index: number) => `${listId}-row-${index}`;

/** The menu's own messages, as distinct from the rows it lists. */
const MESSAGE_TEXT = {
  fontSize: "0.875rem",
  lineHeight: "1.3125rem",
  color: SECONDARY_TEXT,
} as const;

/** Said in both the standalone and the beneath-the-rows case, so said once. */
const PLACES_FAILED = "Places could not be searched";

/**
 * A group's heading. Only ever rendered for a group that has matches — an empty
 * group is absent rather than headed and empty.
 */
const SectionHeader = ({
  label,
  separated,
}: {
  label: string;
  separated: boolean;
}) => (
  <Typography
    sx={{
      padding: "0.25rem 1rem",
      fontSize: "0.75rem",
      lineHeight: "1.125rem",
      fontWeight: 700,
      color: SECTION_HEADER,
      // Full-bleed, as drawn: the rule divides the menu, not the text in it.
      ...(separated && { borderTop: `1px solid ${MENU_SEPARATOR}` }),
    }}
  >
    {label}
  </Typography>
);

type SearchDropdownProps = {
  listId: string;
  query: string;
  projects: readonly ProjectResult[];
  places: readonly PlaceResult[];
  /** The rows as the keyboard walks them, so a row knows its own index. */
  rows: readonly SearchRow[];
  activeIndex: number;
  /** Places are still in flight. Projects are local and already listed. */
  loading: boolean;
  /** The geocoder did not answer. Projects, being local, may still have. */
  placesFailed: boolean;
  onSelect: (row: SearchRow) => void;
};

/**
 * The results menu under the search field.
 *
 * Draws two groups and four states, and the states are not exclusive: project
 * matches are local and arrive instantly, so they are listed above the
 * "Searching" row while the geocoder is still answering, and above the notice
 * that it did not answer at all. Only a query that has settled with nothing on
 * either side gets the no-results message — showing it while a request is in
 * flight, or after one failed, would announce a result the search never
 * reached.
 */
export default function SearchDropdown({
  listId,
  query,
  projects,
  places,
  rows,
  activeIndex,
  loading,
  placesFailed,
  onSelect,
}: SearchDropdownProps) {
  const theme = useTheme();

  // Projects are matched locally, so a geocoder failure can still sit beneath
  // rows that did match. Only with nothing to show at all does the failure
  // replace the menu's message, because "no places match" would then be a
  // claim about a search that never came back.
  const noListbox = !loading && rows.length === 0;

  return (
    <Box
      // Dragging the scrollbar must not blur the field, which would close the
      // menu being scrolled.
      onMouseDown={(event) => event.preventDefault()}
      sx={{
        position: "absolute",
        top: "calc(100% + 0.25rem)",
        left: 0,
        right: 0,
        // Only ever competes inside the bar, which is itself lifted over the
        // map. The filter menus are MUI Menus and portal out of here entirely.
        zIndex: 1,
        maxHeight: SEARCH_MENU_MAX_HEIGHT,
        overflowY: "auto",
        padding: "0.25rem 0",
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${MENU_SEPARATOR}`,
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: MENU_SHADOW,
      }}
    >
      {noListbox ? (
        // Not a listbox: there is nothing to choose from, and an empty one
        // would have the field claim a list that does not exist.
        <Box sx={{ padding: "0.5rem 1rem" }} role="status">
          <Typography sx={{ ...MESSAGE_TEXT, fontWeight: 700 }}>
            {placesFailed ? (
              PLACES_FAILED
            ) : (
              <>No projects or places match &ldquo;{query}&rdquo;</>
            )}
          </Typography>
          <Typography sx={MESSAGE_TEXT}>
            {placesFailed
              ? "The address service did not answer. Please try again."
              : "Check the spelling or try a shorter term"}
          </Typography>
        </Box>
      ) : (
        <Box id={listId} role="listbox" aria-label="Projects and places">
          {projects.length > 0 && (
            <SectionHeader label="EAO Projects" separated={false} />
          )}
          {projects.map((project, index) => (
            <ProjectRow
              key={project.id}
              id={rowId(listId, index)}
              project={project}
              query={query}
              active={activeIndex === index}
              onSelect={() => onSelect(rows[index])}
            />
          ))}

          {places.length > 0 && (
            <SectionHeader label="Places" separated={projects.length > 0} />
          )}
          {places.map((place, index) => (
            <PlaceRow
              key={place.id}
              id={rowId(listId, projects.length + index)}
              place={place}
              query={query}
              active={activeIndex === projects.length + index}
              onSelect={() => onSelect(rows[projects.length + index])}
            />
          ))}

          {loading && (
            <Box
              role="status"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
              }}
            >
              <CircularProgress size={18} />
              <Typography sx={MESSAGE_TEXT}>Searching</Typography>
            </Box>
          )}

          {placesFailed && (
            <Box role="status" sx={{ padding: "0.5rem 1rem" }}>
              <Typography sx={MESSAGE_TEXT}>{PLACES_FAILED}</Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
