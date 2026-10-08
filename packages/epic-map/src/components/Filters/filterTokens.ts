/**
 * The BC Design System values the filter bar is specified in.
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

/** themeGray70 / typographyColorDisabled - a menu row whose option would yield 0. */
export const DIMMED_TEXT = "#9F9D9C";

/** themeGray100 / surfaceColorBorderDark - a checkbox's border. */
export const CHECKBOX_BORDER = "#353433";

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
