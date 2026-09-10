import { useState } from "react";
import { Box, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import CatalogueSearchField from "@/components/Layers/Catalogue/CatalogueSearchField";
import LayersSection from "@/components/Layers/LayersSection";

/**
 * Two characters before anything is fetched: shorter prefixes match most of the
 * catalogue, so the request costs a round trip to say nothing useful.
 */
const MIN_QUERY_LENGTH = 2;

/** Search the BC Data Catalogue and add what comes back to the map. */
export default function CatalogueSection() {
  const theme = useTheme();

  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");

  return (
    <LayersSection
      id="epic-map-layers-catalogue"
      title="BC Data Catalogue"
      expanded={expanded}
      onToggle={() => setExpanded((isExpanded) => !isExpanded)}
    >
      <CatalogueSearchField value={query} onChange={setQuery} />

      {query.trim().length < MIN_QUERY_LENGTH && (
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
              mt: 0.25,
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
            Type {MIN_QUERY_LENGTH} or more characters to find layers.
          </Typography>
        </Box>
      )}
    </LayersSection>
  );
}
