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

/**
 * An imported layer's options menu.
 */
export default function ImportedLayerMenu({
  id,
  layerName,
  anchorEl,
  onClose,
  onEdit,
}: {
  id: string;
  layerName: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();

  const itemSx = {
    gap: "0.375rem",
    minHeight: "auto",
    padding: "0.625rem 1rem",
    fontSize: theme.typography.body2.fontSize,
    "&.Mui-focusVisible": {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: "-2px",
    },
  } as const;

  const iconSx = { minWidth: 0, color: "inherit" } as const;

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
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: "4px",
            boxShadow: theme.shadows[2],
            backgroundColor: theme.palette.common.white,
          },
        },
      }}
    >
      <MenuItem
        onClick={() => {
          onClose();
          onEdit();
        }}
        sx={{ ...itemSx, color: theme.palette.text.primary }}
      >
        <ListItemIcon sx={iconSx}>
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
        onClick={onClose}
        sx={{ ...itemSx, color: theme.palette.error.main }}
      >
        <ListItemIcon sx={iconSx}>
          <DeleteOutlineIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary="Delete layer"
          sx={{ margin: 0 }}
          primaryTypographyProps={{ fontSize: "inherit", color: "inherit" }}
        />
      </MenuItem>
    </Menu>
  );
}
