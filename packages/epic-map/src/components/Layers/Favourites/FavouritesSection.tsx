import { IconButton, Tooltip } from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayersSection from "@/components/Layers/LayersSection";

/**
 * Layers the user has starred, plus the folders they file them under.
 */
export default function FavouritesSection() {
  return (
    <LayersSection
      id="epic-map-layers-favourites"
      title="Favourites"
      count={0}
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
      <DashedEmptyState>
        No favourites yet. Star a layer from the BC Data Catalogue to pin it
        here.
      </DashedEmptyState>
    </LayersSection>
  );
}
