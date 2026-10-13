import { Box, Divider } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap } from "maplibre-gl";
import MapSearch from "@/components/Search/MapSearch";
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
 * The search field goes to one project or one place rather than narrowing the
 * map, so it is independent of the filters either side of it and "Clear filters"
 * leaves it alone.
 */
export default function MapSearchBar({ map }: { map: MapLibreMap | null }) {
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
        // The results menu hangs out of the bar and over the map, and `position`
        // here makes the bar a stacking context - so this value caps everything
        // inside it however high the menu asks to be. It has to clear the
        // controls drawn over the map surface, which is the Layers button at 2
        // and the over-map message at 3.
        position: "relative",
        zIndex: 4,
      }}
    >
      <MapSearch map={map} />

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
