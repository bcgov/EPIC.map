import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { alpha, useTheme } from "@mui/material/styles";
import { useCatalogueSearch } from "@/api/useCatalogueSearch";
import CatalogueSearchField from "@/components/Layers/Catalogue/CatalogueSearchField";
import LayerRow from "@/components/Layers/LayerRow";
import LayersSection from "@/components/Layers/LayersSection";
import {
  CATALOGUE_SEARCH_DEBOUNCE_MS,
  MIN_CATALOGUE_QUERY_LENGTH,
} from "@/utils/config";

/** Search the BC Data Catalogue and add what comes back to the map. */
export default function CatalogueSection() {
  const theme = useTheme();

  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Waits for a pause in typing so a search is not fired per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query),
      CATALOGUE_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const { layers, isLoading, error, retry } =
    useCatalogueSearch(debouncedQuery);

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length >= MIN_CATALOGUE_QUERY_LENGTH;
  const settled = debouncedQuery.trim() === trimmedQuery;
  const hasResults =
    searching && settled && !isLoading && !error && layers.length > 0;

  return (
    <LayersSection
      id="epic-map-layers-catalogue"
      title="BC Data Catalogue"
      expanded={expanded}
      onToggle={() => setExpanded((isExpanded) => !isExpanded)}
      divider={!hasResults}
    >
      <CatalogueSearchField value={query} onChange={setQuery} />

      {!searching && (
        <Box
          sx={{
            display: "flex",
            gap: "0.625rem",
            margin: "0 1rem 0.5rem",
            padding: "0.75rem",
            border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
            borderRadius: `${theme.shape.borderRadius}px`,
            backgroundColor: alpha(theme.palette.primary.main, 0.02),
          }}
        >
          <InfoOutlinedIcon
            aria-hidden
            sx={{
              flexShrink: 0,
              fontSize: "1.125rem",
              color: theme.palette.primary.main,
            }}
          />
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              lineHeight: 1.5,
              color: theme.palette.text.primary,
            }}
          >
            Search the BC Data Catalogue
            <br />
            Type {MIN_CATALOGUE_QUERY_LENGTH} or more characters to find layers.
          </Typography>
        </Box>
      )}

      {searching && (!settled || isLoading) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
          }}
        >
          <CircularProgress size={16} />
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            Searching BC Data Catalogue…
          </Typography>
        </Box>
      )}

      {searching && settled && !isLoading && error && (
        <Box sx={{ padding: "0.75rem 1rem", textAlign: "center" }}>
          <WarningAmberIcon
            aria-hidden
            sx={{ fontSize: "1.25rem", color: theme.palette.text.secondary }}
          />
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.primary,
            }}
          >
            Couldn't reach the BC Data Catalogue
          </Typography>
          <Button
            variant="text"
            color="secondary"
            onClick={() => retry()}
            sx={{ fontSize: theme.typography.caption.fontSize }}
          >
            Try again
          </Button>
        </Box>
      )}

      {searching && settled && !isLoading && !error && layers.length === 0 && (
        <Box sx={{ padding: "0.75rem 1rem", textAlign: "center" }}>
          <SearchOffIcon
            aria-hidden
            sx={{ fontSize: "1.25rem", color: theme.palette.text.secondary }}
          />
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.primary,
            }}
          >
            No layers match &ldquo;{trimmedQuery}&rdquo;
          </Typography>
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.disabled,
            }}
          >
            Try a different keyword
          </Typography>
        </Box>
      )}

      {hasResults && (
        <>
          <Typography
            aria-live="polite"
            sx={{
              padding: "0 1rem 0.5rem",
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            {layers.length} layer(s) found
          </Typography>
          <Box component="ul" sx={{ margin: 0, padding: 0 }}>
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                query={debouncedQuery.trim()}
              />
            ))}
          </Box>
        </>
      )}
    </LayersSection>
  );
}
