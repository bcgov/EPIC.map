import {
  Divider,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
} from "@mui/material";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import { useTheme } from "@mui/material/styles";
import type { MoveDestination } from "@/components/Layers/Favourites/grouping";
import { MAX_FAVOURITE_FOLDERS } from "@/utils/config";

/** The current group, per the design: BC blue, bold, checked. */
const CURRENT_COLOR = "#013366";

type MoveToGroupMenuProps = {
  id: string;
  layerName: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  destinations: readonly MoveDestination[];
  /** Only called for a destination other than the current one. */
  onMove: (destination: MoveDestination) => void;
  onNewFolder: () => void;
  atFolderCap: boolean;
};

/**
 * A favourite's options menu: move it to the top level, to any folder, or into
 * a new one, without dragging.
 *
 * The keyboard and screen reader route to what MAP-34 does by drag. MUI's menu
 * brings the arrow keys, Escape, and focus back to the kebab on close.
 */
export default function MoveToGroupMenu({
  id,
  layerName,
  anchorEl,
  onClose,
  destinations,
  onMove,
  onNewFolder,
  atFolderCap,
}: MoveToGroupMenuProps) {
  const theme = useTheme();

  const itemSx = {
    gap: "0.5rem",
    minHeight: "auto",
    padding: "0.5rem 1rem",
    // A long folder name wraps rather than truncating.
    whiteSpace: "normal",
    fontSize: theme.typography.body2.fontSize,
    "&.Mui-focusVisible": {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: "-2px",
    },
  } as const;

  const iconSx = { minWidth: 0, color: "inherit" } as const;

  const destinationItem = (destination: MoveDestination) => {
    const { current } = destination;
    const Icon =
      destination.folderId === null ? StarOutlineIcon : FolderOutlinedIcon;
    return (
      <MenuItem
        key={destination.folderId ?? "top-level"}
        role="menuitemradio"
        aria-checked={current}
        disabled={destination.pending}
        onClick={() => {
          onClose();
          if (!current) onMove(destination);
        }}
        sx={{
          ...itemSx,
          color: current ? CURRENT_COLOR : theme.palette.text.primary,
          fontWeight: current
            ? theme.typography.fontWeightBold
            : theme.typography.fontWeightRegular,
        }}
      >
        <ListItemIcon sx={iconSx}>
          <Icon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={destination.name}
          primaryTypographyProps={{
            fontSize: "inherit",
            fontWeight: "inherit",
            // The theme colours Typography itself, which would win otherwise.
            color: "inherit",
            lineHeight: 1.4,
          }}
        />
        {current && (
          <CheckOutlinedIcon
            aria-hidden
            fontSize="small"
            sx={{ flexShrink: 0, marginLeft: "0.5rem" }}
          />
        )}
      </MenuItem>
    );
  };

  return (
    <Menu
      id={id}
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      // Focus starts on the first item, not the checked one.
      variant="menu"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      MenuListProps={{
        "aria-label": `Move ${layerName} to group`,
        dense: true,
        sx: { paddingY: "0.25rem" },
        // A folder name is the user's: one long word must not overflow.
        style: { overflowWrap: "anywhere" },
      }}
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            minWidth: "12rem",
            maxWidth: "18rem",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: "4px",
            boxShadow: theme.shadows[2],
            backgroundColor: theme.palette.common.white,
          },
        },
      }}
    >
      {/* The list's own label says this to a screen reader already. */}
      <ListSubheader
        aria-hidden
        disableSticky
        sx={{
          lineHeight: 1.4,
          padding: "0.5rem 1rem",
          fontSize: theme.typography.body2.fontSize,
          fontWeight: theme.typography.fontWeightBold,
          color: theme.palette.text.primary,
          backgroundColor: "transparent",
        }}
      >
        Move to group
      </ListSubheader>

      {destinations.map(destinationItem)}

      <Divider sx={{ marginY: 0 }} />

      <MenuItem
        disabled={atFolderCap}
        onClick={() => {
          onClose();
          onNewFolder();
        }}
        sx={{ ...itemSx, color: theme.palette.text.primary }}
      >
        <ListItemIcon sx={iconSx}>
          <CreateNewFolderIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={
            atFolderCap
              ? `Folder limit reached (${MAX_FAVOURITE_FOLDERS})`
              : "New Folder"
          }
          primaryTypographyProps={{ fontSize: "inherit" }}
        />
      </MenuItem>
    </Menu>
  );
}
