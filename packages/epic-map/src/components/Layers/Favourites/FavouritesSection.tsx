import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayerRow from "@/components/Layers/LayerRow";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";

/**
 * Layers the user has starred, restored from map-api.
 *
 * "New folder" is a placeholder until folders land with their ticket.
 */
export default function FavouritesSection() {
  const theme = useTheme();
  const { favourites, favouritesPending, favouritesError, retryFavourites } =
    useLayers();

  const favouriteList = () => (
    <Box component="ul" sx={{ margin: 0, padding: 0 }}>
      {favourites.map((layer) => (
        <LayerRow key={layer.id} layer={layer} />
      ))}
    </Box>
  );

  const body = () => {
    if (favouritesPending) {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0 1rem 0.5rem",
          }}
        >
          <CircularProgress size={14} />
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            Loading your favourites…
          </Typography>
        </Box>
      );
    }

    const stale = favourites.length > 0;

    if (favouritesError) {
      return (
        <>
          <Box
            sx={{
              padding: "0 1rem 0.5rem",
              textAlign: stale ? "left" : "center",
            }}
          >
            <Typography
              sx={{
                fontSize: theme.typography.caption.fontSize,
                color: theme.palette.text.primary,
              }}
            >
              <WarningAmberIcon
                aria-hidden
                sx={{
                  verticalAlign: "text-bottom",
                  marginRight: "0.25rem",
                  fontSize: "1rem",
                  color: theme.palette.text.secondary,
                }}
              />
              {stale
                ? "Couldn’t refresh your favourites"
                : "Couldn’t load your favourites"}
            </Typography>
            <Button
              variant="text"
              color="secondary"
              onClick={retryFavourites}
              sx={{ fontSize: theme.typography.caption.fontSize }}
            >
              Try again
            </Button>
          </Box>
          {stale && favouriteList()}
        </>
      );
    }

    if (!stale) {
      return (
        <DashedEmptyState>
          No favourites yet. Star a layer from the BC Data Catalogue to pin it
          here.
        </DashedEmptyState>
      );
    }

    return favouriteList();
  };

  return (
    <LayersSection
      id="epic-map-layers-favourites"
      title="Favourites"
      count={favourites.length}
      action={
        <Tooltip title="New folder">
          <IconButton size="small" aria-label="New folder">
            <CreateNewFolderOutlinedIcon
              sx={{ fontSize: "1.25rem", color: "primary.main" }}
            />
          </IconButton>
        </Tooltip>
      }
    >
      {body()}
    </LayersSection>
  );
}
