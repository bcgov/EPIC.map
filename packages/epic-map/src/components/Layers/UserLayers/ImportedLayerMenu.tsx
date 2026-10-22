import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useTheme } from "@mui/material/styles";
import {
  rowMenuIconSx,
  rowMenuItemSx,
  rowMenuPaperSx,
} from "@/components/Layers/LayerRow";

/**
 * An imported layer's options menu.
 */
export default function ImportedLayerMenu({
  id,
  layerName,
  anchorEl,
  onClose,
  onEdit,
  onDelete,
}: {
  id: string;
  layerName: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const itemSx = rowMenuItemSx(theme);

  return (
    <Menu
      id={id}
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      variant="menu"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      MenuListProps={{
        "aria-label": `Actions for ${layerName}`,
        dense: true,
        sx: { paddingY: 0 },
      }}
      slotProps={{ paper: { elevation: 0, sx: rowMenuPaperSx(theme) } }}
    >
      <MenuItem
        onClick={() => {
          onClose();
          onEdit();
        }}
        sx={{ ...itemSx, color: theme.palette.text.primary }}
      >
        <ListItemIcon sx={rowMenuIconSx}>
          <EditOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary="Edit layer"
          sx={{ margin: 0 }}
          primaryTypographyProps={{ fontSize: "inherit" }}
        />
      </MenuItem>
      <Divider sx={{ "&&": { marginY: 0 } }} />
      <MenuItem
        onClick={() => {
          onClose();
          onDelete();
        }}
        sx={{ ...itemSx, color: theme.palette.error.main }}
      >
        <ListItemIcon sx={rowMenuIconSx}>
          <DeleteOutlineIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary="Delete layer"
          sx={{ margin: 0 }}
          primaryTypographyProps={{
            fontSize: "inherit",
            color: theme.palette.error.main,
          }}
        />
      </MenuItem>
    </Menu>
  );
}
