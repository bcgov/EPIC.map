import { Box, Divider, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import ClearFiltersLink from "@/components/Filters/ClearFiltersLink";
import FilterDropdown from "@/components/Filters/FilterDropdown";
import FilterToggle from "@/components/Filters/FilterToggle";
import { useFilters } from "@/components/Filters/FiltersContext";
import { BORDER_DEFAULT } from "@/components/Filters/filterTokens";

/**
 * The filter bar above the map.
 *
 * Left to right: search, the two multi-select dropdowns, a divider, the two
 * toggles, and - only while something is filtering - "Clear filters" directly
 * after them rather than pushed to the far right, so it reads as belonging to
 * the controls it undoes.
 *
 * The search field is still a placeholder: project and place search is its own
 * piece of work, so it does not narrow anything here and "Clear filters" leaves
 * it alone.
 */
export default function MapSearchBar() {
  const theme = useTheme();
  const {
    types,
    regions,
    filters,
    anyFilterActive,
    toggleCertificateIssued,
    toggleInProgressWorks,
    clearFilters,
  } = useFilters();

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

      <FilterDropdown
        label="Type"
        allLabel="All Types"
        group="typeId"
        options={types}
      />
      <FilterDropdown
        label="Region"
        allLabel="All Regions"
        group="regionId"
        options={regions}
      />

      <Divider
        orientation="vertical"
        flexItem
        sx={{ borderColor: BORDER_DEFAULT, marginY: "0.5rem" }}
      />

      <FilterToggle
        label="Certificate issued"
        on={filters.certificateIssued}
        onToggle={toggleCertificateIssued}
      />
      <FilterToggle
        label="In-progress works"
        on={filters.inProgressWorks}
        onToggle={toggleInProgressWorks}
      />

      {anyFilterActive && <ClearFiltersLink onClick={clearFilters} />}
    </Box>
  );
}
