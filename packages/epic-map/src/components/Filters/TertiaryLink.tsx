import { Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { focusRing, HOVER_FILL, LINK } from "@/components/Filters/filterTokens";

type TertiaryLinkProps = {
  onClick: () => void;
  children: string;
  "aria-label"?: string;
};

/**
 * A tertiary text button: "Clear filters", "Try again" and "Dismiss".
 *
 * Three of these exist at once by design - one in the filter bar and two on the
 * over-map message, whose shortcuts are additions rather than replacements - so
 * the styling is shared rather than duplicated. Only the label differs.
 *
 * A button rather than an anchor - each changes state on this page and navigates
 * nowhere, so there is no href to give it, and a link without one is not
 * reachable by keyboard.
 */
export default function TertiaryLink({
  onClick,
  children,
  "aria-label": ariaLabel,
}: TertiaryLinkProps) {
  const theme = useTheme();

  return (
    <Button
      // Both explicit because a host's theme may default MuiButton to something
      // filled - epic.theme defaults it to contained/primary, which paints this
      // navy. A tertiary link has to state that it has no fill of its own.
      variant="text"
      onClick={onClick}
      aria-label={ariaLabel}
      disableRipple
      sx={{
        height: "2.25rem",
        minWidth: 0,
        padding: "0 0.75rem",
        borderRadius: `${theme.shape.borderRadius}px`,
        fontSize: theme.typography.body2.fontSize,
        lineHeight: "1.313rem",
        fontWeight: theme.typography.fontWeightRegular,
        textDecoration: "underline",
        // Transparent rather than white: this sits on the filter bar and on the
        // over-map card, and takes whichever is behind it.
        backgroundColor: "transparent",
        color: LINK,
        whiteSpace: "nowrap",
        "&:hover": {
          backgroundColor: HOVER_FILL,
          color: theme.palette.primary.main,
          textDecoration: "underline",
        },
        ...focusRing,
      }}
    >
      {children}
    </Button>
  );
}
