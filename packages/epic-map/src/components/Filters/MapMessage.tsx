import { Box, Fade, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme } from "@mui/material/styles";
import ClearFiltersLink from "@/components/Filters/ClearFiltersLink";
import { useFilters } from "@/components/Filters/FiltersContext";
import {
  BORDER_DEFAULT,
  INFO_ICON,
  MENU_SHADOW,
} from "@/components/Filters/filterTokens";
import { LAYERS_BUTTON_WIDTH, MAP_MESSAGE_FADE_MS } from "@/utils/config";

/**
 * The one message that explains an empty map.
 *
 * Deliberately a single rule rather than a state on each control: any
 * combination of Type, Region and the two toggles that matches nothing is the
 * same situation to the user, and saying so once beats dimming four controls and
 * leaving them to work out which one did it.
 *
 * Sits in the Layers button's row and is centred in what is left to the right of
 * it, so the two never collide. Above the map and its markers, and below an open
 * dropdown - which a portalled MUI menu is by default.
 *
 * The live region is the element that stays mounted while the card inside it
 * comes and goes. That order matters: an aria-live region announces a change to
 * its *contents*, so a card that was always present and merely made visible
 * would fade in silently. `unmountOnExit` is what makes its arrival a change,
 * and it still leaves the fade out to run first.
 */
export default function MapMessage() {
  const theme = useTheme();
  const { noMatches, clearFilters } = useFilters();

  return (
    <Box
      role="status"
      sx={{
        position: "absolute",
        top: "1rem",
        // Begins after the Layers button, with the 8px minimum gap. Centred in
        // what is left; on a map too narrow to centre in, the card fills the
        // row and so sits flush after Layers rather than over it.
        left: `calc(1rem + ${LAYERS_BUTTON_WIDTH} + 0.5rem)`,
        right: "1rem",
        zIndex: 3,
        display: "flex",
        justifyContent: "center",
        minWidth: 0,
        // Never swallows a click meant for the map behind it; the card inside
        // takes its own back.
        pointerEvents: "none",
      }}
    >
      <Fade in={noMatches} timeout={MAP_MESSAGE_FADE_MS} unmountOnExit>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            height: "2.75rem",
            // Bounded by the row it sits in, so a long message is clipped at
            // the gutter instead of spilling back over the Layers button.
            maxWidth: "100%",
            minWidth: 0,
            overflow: "hidden",
            padding: "0.25rem 0.25rem 0.25rem 1rem",
            backgroundColor: theme.palette.common.white,
            border: `1px solid ${BORDER_DEFAULT}`,
            borderRadius: `${theme.shape.borderRadius}px`,
            boxShadow: MENU_SHADOW,
            pointerEvents: "auto",
          }}
        >
          <InfoOutlinedIcon
            sx={{ flexShrink: 0, fontSize: "1.25rem", color: INFO_ICON }}
          />
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              lineHeight: "1.313rem",
              color: theme.palette.text.primary,
              whiteSpace: "nowrap",
            }}
          >
            No projects match these filters
          </Typography>
          <ClearFiltersLink onClick={clearFilters} />
        </Box>
      </Fade>
    </Box>
  );
}
