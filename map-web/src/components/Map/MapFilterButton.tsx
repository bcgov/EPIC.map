import { Button } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { BCDesignTokens } from "epic.theme";

type MapFilterButtonProps = {
  label: string;
};

/** Filter dropdown trigger used in the map search bar. */
export default function MapFilterButton({ label }: MapFilterButtonProps) {
  return (
    <Button
      variant="contained"
      color="secondary"
      endIcon={<KeyboardArrowDownIcon />}
      sx={{
        height: "2.5rem",
        padding: "0 0.75rem 0 1rem",
        fontSize: BCDesignTokens.typographyFontSizeSmallBody,
        fontWeight: BCDesignTokens.typographyFontWeightsRegular,
        color: BCDesignTokens.typographyColorPrimary,
        borderColor: BCDesignTokens.surfaceColorBorderDefault,
        whiteSpace: "nowrap",
        "&:hover": {
          backgroundColor: BCDesignTokens.surfaceColorBackgroundWhite,
          borderColor: BCDesignTokens.themeGray70,
        },
      }}
    >
      {label}
    </Button>
  );
}
