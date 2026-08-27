import { Box, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { BCDesignTokens } from "epic.theme";
import MapFilterButton from "@/components/Map/MapFilterButton";

/**
 * Search and filter controls that sit above the map.
 * Placeholders for now - none of them are wired up to data yet.
 */
export default function MapSearchBar() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        height: "3.75rem",
        gap: "0.75rem",
        padding: "0.625rem 1.5rem",
        backgroundColor: BCDesignTokens.surfaceColorBackgroundWhite,
        borderBottom: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
      }}
    >
      <TextField
        placeholder="Search projects and places..."
        sx={{
          width: "25rem",
          flexShrink: 0,
          marginBottom: 0,
          "& .MuiInputBase-root": {
            fontSize: BCDesignTokens.typographyFontSizeSmallBody,
          },
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <SearchIcon sx={{ color: BCDesignTokens.typographyColorSecondary }} />
            </InputAdornment>
          ),
        }}
      />
      <MapFilterButton label="Type" />
      <MapFilterButton label="Region" />
    </Box>
  );
}
