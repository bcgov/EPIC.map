import { Box, Button } from "@mui/material";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap } from "maplibre-gl";
import CatalogueSection from "@/components/Layers/Catalogue/CatalogueSection";
import FavouritesSection from "@/components/Layers/Favourites/FavouritesSection";
import MyLayersSection from "@/components/Layers/UserLayers/MyLayersSection";
import { LayersProvider } from "@/components/Layers/LayersContext";
import { useSessionFlag } from "@/utils/useSessionFlag";

/** Ties the button's `aria-controls` to the panel it opens. */
const PANEL_ID = "epic-map-layers-panel";

/** Namespaced: the widget is a guest in the host's sessionStorage. */
const PANEL_OPEN_KEY = "epic-map:layers-panel-open";

/**
 * The Layers button and the panel it opens.
 */
export default function LayersControl({ map }: { map: MapLibreMap | null }) {
  const theme = useTheme();

  const [open, setOpen] = useSessionFlag(PANEL_OPEN_KEY, false);

  return (
    <LayersProvider map={map}>
      <Button
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        startIcon={<LayersOutlinedIcon sx={{ fontSize: "1.125rem" }} />}
        sx={{
          position: "absolute",
          left: "1rem",
          top: "1rem",
          zIndex: 2,
          height: "2.25rem",
          padding: "0 0.875rem",
          borderRadius: `${theme.shape.borderRadius}px`,
          boxShadow: theme.shadows[2],
          fontSize: theme.typography.body2.fontSize,
          fontWeight: theme.typography.fontWeightMedium,
          whiteSpace: "nowrap",
          // Filled while the panel is open, so the pair reads as one open thing.
          ...(open
            ? {
                backgroundColor: theme.palette.primary.main,
                border: `1px solid ${theme.palette.primary.main}`,
                color: theme.palette.primary.contrastText,
                "&:hover": { backgroundColor: theme.palette.primary.dark },
              }
            : {
                backgroundColor: theme.palette.common.white,
                border: `1px solid ${theme.palette.divider}`,
                color: theme.palette.text.primary,
                "&:hover": {
                  backgroundColor: theme.palette.common.white,
                  borderColor: theme.palette.grey[500],
                },
              }),
        }}
      >
        Layers
      </Button>

      {open && (
        <Box
          id={PANEL_ID}
          role="complementary"
          aria-label="Layers"
          sx={{
            position: "absolute",
            left: "1rem",
            top: "3.75rem",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            width: "18.75rem",
            // Bounded by the map, so it never grows past the widget's container.
            maxHeight: "calc(100% - 4.75rem)",
            overflowY: "auto",
            backgroundColor: theme.palette.background.default,
            borderRadius: "0.5rem",
            boxShadow: theme.shadows[6],
          }}
        >
          <FavouritesSection />
          <CatalogueSection />
          <MyLayersSection />
        </Box>
      )}
    </LayersProvider>
  );
}
