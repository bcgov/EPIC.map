/**
 * The BC Design System values the bar above the map is specified in.
 *
 * The filter controls first, then the search field and its results dropdown -
 * one list because the two sit side by side in the same bar and have to agree
 * on a border and a hover, and because a second tokens file would be the same
 * hexes under different names.
 *
 * This package deliberately has no dependency on `epic.theme` - it is a
 * federated remote loaded into hosts that bring their own MUI theme, so it reads
 * colour from `useTheme()` and lets the host re-skin it. Three of the values the
 * design calls for do come back from the theme and are taken from there rather
 * than repeated here:
 *
 *   theme.palette.primary.main   #013366  the blue of an active control
 *   theme.palette.text.primary   #2D2D2D  menu text
 *   theme.shape.borderRadius     4px      every corner in the bar
 *
 * The rest are below, each named for the BCDesignToken it is. They are
 * constants rather than theme lookups because the theme has no slot that means
 * them: `palette.divider` is rgba(0,0,0,0.12), not the #D8D8D8 the design
 * specifies, and `palette.background.default` is white rather than a hover grey.
 * Reaching for the nearest-looking theme slot would quietly draw a different
 * control than the one in Figma.
 */

/** surfaceColorBorderDefault - the resting border of every control in the bar. */
export const BORDER_DEFAULT = "#D8D8D8";

/** themeGray30 / surfaceColorTertiaryButtonHover - hover fill of an inactive control. */
export const HOVER_FILL = "#ECEAE8";

/** surfaceColorBackgroundLightBlue / themeBlue10 - fill of an active control. */
export const ACTIVE_FILL = "#F1F8FE";

/** themeBlue20 - hover fill of an already-active control. */
export const ACTIVE_HOVER_FILL = "#D8EAFD";

/** surfaceColorMenusHover - hover fill of one row inside an open menu. */
export const MENU_ROW_HOVER_FILL = "#EDEBE9";

/** surfaceColorBorderActive - the keyboard focus ring. */
export const FOCUS_RING = "#2E5DD7";

/** typographyColorLink - the "Clear filters" link. */
export const LINK = "#255A90";

/**
 * themeGray70 - a menu row whose option would yield 0, and, as
 * `typographyColorPlaceholder`, the search field's placeholder. One value under
 * two token names; both mean text that is present but not being offered.
 */
export const DIMMED_TEXT = "#9F9D9C";

/** themeGray100 / surfaceColorBorderDark - the darkest border in the bar. */
export const BORDER_DARK = "#353433";

/** A checkbox's border, and the search field's border on hover. */
export const CHECKBOX_BORDER = BORDER_DARK;

/** iconsColorInfo - the info icon on the over-map message. */
export const INFO_ICON = "#053662";

/** The separator under a menu's "All ..." row. */
export const MENU_SEPARATOR = "#ECEAE8";

/** Drop shadow shared by the dropdown menus and the over-map message. */
export const MENU_SHADOW = "0 8px 24px 0 rgba(0, 0, 0, 0.2)";

/**
 * Focus ring as an outline rather than a box-shadow: an outline is drawn
 * outside the border box without affecting layout, which is what "2px offset
 * just outside the control" means, and `:focus-visible` is what keeps it off a
 * mouse click.
 */
export const focusRing = {
  "&:focus-visible": {
    outline: `2px solid ${FOCUS_RING}`,
    outlineOffset: "2px",
  },
} as const;

/** Height of every trigger and toggle button in the bar. */
export const CONTROL_HEIGHT = "2.5rem";

/** Height of one option row inside an open menu. */
export const MENU_ROW_HEIGHT = "2.25rem";

/** Width of the Type and Region menus. Wide enough for the longest type name. */
export const MENU_WIDTH = "19rem";

/**
 * themeGray10 / surfaceColorBackgroundLightGray - hover fill of one search
 * result.
 *
 * Deliberately far lighter than MENU_ROW_HOVER_FILL, which the filter menus use.
 * A result row is 55px of two stacked lines and the list runs to ten of them, so
 * the heavier grey that reads as one highlighted option among six reads as a
 * banded table here. Measured off the Figma frame rather than taken from the
 * ticket's prose, which says ECEAE8.
 */
export const RESULT_ROW_HOVER_FILL = "#FAF9F8";

/** themeGray20 - the pill carrying a place's type. */
export const PILL_FILL = "#F3F2F1";

/**
 * typographyColorSecondary - the second line of a result: a project's type, a
 * place's locality, and the dropdown's "Searching" and no-results text.
 *
 * Not `palette.text.secondary`, which is MUI's rgba(0, 0, 0, 0.6) - a
 * transparency over whatever is behind it rather than this flat warm grey.
 */
export const SECONDARY_TEXT = "#474543";

/** iconsColorInfo - the "EAO Projects" and "Places" headers. */
export const SECTION_HEADER = "#053662";

/** Width of the search field and, with it, of the results dropdown. */
export const SEARCH_WIDTH = "25rem";

/** How far the results dropdown grows before it scrolls. */
export const SEARCH_MENU_MAX_HEIGHT = "25rem";
