import { Box, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import MapFilterButton from "@/components/MapFilterButton";

/**
 * Search and filter controls that sit above the map.
 * Placeholders for now - none of them are wired up to data yet.
 *
 * Moved from map-web. Colours come from the host's theme via useTheme(); nothing
 * here reads configuration or a token.
 */
export default function MapSearchBar() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        height: "3.75rem",
        gap: "0.75rem",
        padding: "0.625rem 1.5rem",
        backgroundColor: theme.palette.background.default,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <TextField
        placeholder="Search projects and places..."
        sx={{
          width: "25rem",
          flexShrink: 0,
          marginBottom: 0,
          "& .MuiInputBase-root": {
            fontSize: theme.typography.body2.fontSize,
          },
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <SearchIcon sx={{ color: theme.palette.text.secondary }} />
            </InputAdornment>
          ),
        }}
      />
      <MapFilterButton label="Type" />
      <MapFilterButton label="Region" />
    </Box>
  );
}
