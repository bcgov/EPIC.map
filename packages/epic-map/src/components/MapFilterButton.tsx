import { Button } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";

type MapFilterButtonProps = {
  label: string;
};

/**
 * Filter dropdown trigger used in the map search bar.
 *
 * Moved from map-web. The BCDesignTokens it used are now read from the host's MUI
 * theme, so the button takes its colours from whichever application embeds it.
 */
export default function MapFilterButton({ label }: MapFilterButtonProps) {
  const theme = useTheme();

  return (
    <Button
      variant="contained"
      color="secondary"
      endIcon={<KeyboardArrowDownIcon />}
      sx={{
        height: "2.5rem",
        padding: "0 0.75rem 0 1rem",
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightRegular,
        color: theme.palette.text.primary,
        borderColor: theme.palette.divider,
        whiteSpace: "nowrap",
        "&:hover": {
          backgroundColor: theme.palette.background.default,
          borderColor: theme.palette.grey[500],
        },
      }}
    >
      {label}
    </Button>
  );
}
