import { IconButton, Tooltip } from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import { Box } from "@mui/material";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayerRow from "@/components/Layers/LayerRow";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";

/**
 * Layers the user has starred, plus the folders they file them under.
 */
export default function FavouritesSection() {
  const { favourites } = useLayers();

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
      {favourites.length === 0 ? (
        <DashedEmptyState>
          No favourites yet. Star a layer from the BC Data Catalogue to pin it
          here.
        </DashedEmptyState>
      ) : (
        <Box component="ul" sx={{ margin: 0, padding: 0 }}>
          {favourites.map((layer) => (
            <LayerRow key={layer.id} layer={layer} />
          ))}
        </Box>
      )}
    </LayersSection>
  );
}
