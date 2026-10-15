import type { ReactNode } from "react";
import { Box, Fade, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme } from "@mui/material/styles";
import TertiaryLink from "@/components/Filters/TertiaryLink";
import { useFilters } from "@/components/Filters/FiltersContext";
import {
  BORDER_DEFAULT,
  INFO_ICON,
  MENU_SHADOW,
} from "@/components/Filters/filterTokens";
import { LAYERS_BUTTON_WIDTH, MAP_MESSAGE_FADE_MS } from "@/utils/config";

/**
 * The message that explains an empty map, for either reason it can be empty.
 *
 * A combination that matches nothing is deliberately a single rule rather than a
 * state on each control: any empty combination is the same situation to the
 * user, and saying so once beats dimming four controls and leaving them to work
 * out which one did it.
 *
 * A project list that could not be loaded is the other reason, and it gets its
 * own words and a retry rather than the filter message or silence. It takes
 * precedence: the filters cannot be said to match nothing when there is nothing
 * for them to have matched. The context's rules already make the two exclusive,
 * but the precedence is stated here too - two cards in one live region would
 * announce twice and give contradictory reasons for the same empty map.
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
  const { noMatches, loadFailed, clearFilters, retryProjects } = useFilters();

  // Both cards are the same card but for their contents, and they sit inside
  // one live region so that either arriving is announced as a change to it.
  const card = (message: string, action: ReactNode) => (
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
        {message}
      </Typography>
      {action}
    </Box>
  );

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
      <Fade
        in={noMatches && !loadFailed}
        timeout={MAP_MESSAGE_FADE_MS}
        unmountOnExit
      >
        {card(
          "No projects match these filters",
          <TertiaryLink onClick={clearFilters}>Clear filters</TertiaryLink>,
        )}
      </Fade>

      <Fade in={loadFailed} timeout={MAP_MESSAGE_FADE_MS} unmountOnExit>
        {card(
          "Projects could not be loaded",
          <TertiaryLink onClick={retryProjects}>Try again</TertiaryLink>,
        )}
      </Fade>
    </Box>
  );
}
