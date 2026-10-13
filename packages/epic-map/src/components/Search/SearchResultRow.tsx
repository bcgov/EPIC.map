import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import MatchedText from "@/components/Search/MatchedText";
import type {
  PlaceResult,
  ProjectResult,
} from "@/components/Search/searchUtils";
import {
  PILL_FILL,
  RESULT_ROW_HOVER_FILL,
  SECONDARY_TEXT,
} from "@/components/Filters/filterTokens";

/**
 * The 55px two-line row both groups are drawn as: 4px of padding, a 21px name,
 * a 2px gap and a 24px second line. Measured off the design rather than chosen.
 */
const rowSx = {
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  padding: "0.25rem 1rem",
  cursor: "pointer",
  // One rule for hover and for the keyboard's active row, so arrowing down the
  // list looks the same as running the mouse down it.
  "&:hover, &[data-active='true']": {
    backgroundColor: RESULT_ROW_HOVER_FILL,
  },
} as const;

const nameSx = {
  fontSize: "0.875rem",
  lineHeight: "1.3125rem",
  color: "text.primary",
} as const;

const secondarySx = {
  fontSize: "0.75rem",
  lineHeight: "1.125rem",
  color: SECONDARY_TEXT,
} as const;

type RowProps = {
  id: string;
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
};

/**
 * `onMouseDown` with its default prevented rather than `onClick`: the field has
 * focus while the dropdown is open, and a plain click would blur it first,
 * closing the dropdown out from under the row being clicked.
 */
const Row = ({ id, active, onSelect, children }: RowProps) => (
  <Box
    id={id}
    role="option"
    aria-selected={active}
    data-active={active}
    onMouseDown={(event) => {
      event.preventDefault();
      onSelect();
    }}
    sx={rowSx}
  >
    {children}
  </Box>
);

/** A project match: its name, and Track's name for its type beneath. */
export const ProjectRow = ({
  id,
  project,
  query,
  active,
  onSelect,
}: {
  id: string;
  project: ProjectResult;
  query: string;
  active: boolean;
  onSelect: () => void;
}) => (
  <Row id={id} active={active} onSelect={onSelect}>
    <Typography sx={nameSx}>
      <MatchedText text={project.name} query={query} />
    </Typography>
    {project.type && <Typography sx={secondarySx}>{project.type}</Typography>}
  </Row>
);

/**
 * A place match: its name, and beneath it the type pill and — only for a street
 * address — the locality the street is in.
 */
export const PlaceRow = ({
  id,
  place,
  query,
  active,
  onSelect,
}: {
  id: string;
  place: PlaceResult;
  query: string;
  active: boolean;
  onSelect: () => void;
}) => (
  <Row id={id} active={active} onSelect={onSelect}>
    <Typography sx={nameSx}>
      <MatchedText text={place.name} query={query} />
    </Typography>
    {(place.pill || place.locality) && (
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {place.pill && (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              height: "1.5rem",
              padding: "0 0.5rem",
              // Fully rounded rather than a radius: the pill is a shape, and a
              // 4px corner on 24px reads as a mis-sized button.
              borderRadius: "624.9375rem",
              backgroundColor: PILL_FILL,
              fontSize: "0.75rem",
              lineHeight: "1.125rem",
              color: "text.primary",
              whiteSpace: "nowrap",
            }}
          >
            {place.pill}
          </Box>
        )}
        {place.locality && (
          <Typography
            sx={{
              ...secondarySx,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {place.locality}
          </Typography>
        )}
      </Box>
    )}
  </Row>
);
