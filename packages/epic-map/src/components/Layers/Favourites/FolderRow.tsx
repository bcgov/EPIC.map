import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Box,
  Collapse,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOffOutlinedIcon from "@mui/icons-material/FolderOffOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useTheme, type Theme } from "@mui/material/styles";
import type { FavouriteFolder } from "@/api/useFavouriteFolders";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import DropIndicator from "@/components/Layers/Favourites/DropIndicator";
import FolderNameField from "@/components/Layers/Favourites/FolderNameField";
import { useFavouriteDropTarget } from "@/components/Layers/Favourites/useFavouriteDropTarget";

const focusRing = (theme: Theme) => ({
  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: "-2px",
  },
});

type FolderRowProps = {
  folder: FavouriteFolder;
  /** True while the name is being typed, for a new folder or a rename. */
  editing: boolean;
  /** Layers filed in this folder. Empty renders the drop zone instead. */
  children?: ReactNode;
  empty: boolean;
  onStartRename: () => void;
  /** The name as committed. Blank is not refused - map-api names it for us. */
  onCommitName: (name: string) => void;
  /** Escape: a new folder is discarded, an existing one keeps its name. */
  onCancelEdit: () => void;
  onToggleCollapsed: () => void;
  /** Removes the folder; its layers move to the top level. */
  onUngroup: () => void;
  onDropLayer: (layerId: string) => void;
  /** Focus the chevron: a layer moved in while the folder was closed. */
  focusHeader?: boolean;
  onHeaderFocused?: () => void;
};

/**
 * One folder in Favourites: chevron, name, actions, and the layers inside it.
 *
 * The whole folder is the drop target, header included: a full folder has no
 * dashed zone left to aim at, and a collapsed one is only its header.
 */
export default function FolderRow({
  folder,
  editing,
  children,
  empty,
  onStartRename,
  onCommitName,
  onCancelEdit,
  onToggleCollapsed,
  onUngroup,
  onDropLayer,
  focusHeader = false,
  onHeaderFocused,
}: FolderRowProps) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { over, dropProps } = useFavouriteDropTarget(onDropLayer);
  const chevronRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!focusHeader) return;
    chevronRef.current?.focus();
    onHeaderFocused?.();
  }, [focusHeader, onHeaderFocused]);

  const bodyId = `epic-map-folder-${folder.folderId}-body`;

  const name = editing ? (
    // Mounted only while editing, so nothing arriving mid-edit can reseed it.
    <FolderNameField
      initialName={folder.name}
      onCommit={onCommitName}
      onCancel={onCancelEdit}
    />
  ) : (
    <Typography
      component="span"
      // Only the name opens the rename; the chevron and kebab have their own.
      onClick={onStartRename}
      sx={{
        flexGrow: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        padding: "0.125rem 0.5rem",
        // Held whether or not it shows, so the field's border shifts nothing.
        border: "1px solid transparent",
        cursor: "text",
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightBold,
        color: theme.palette.text.primary,
      }}
    >
      {folder.name}
    </Typography>
  );

  return (
    <Box component="li" sx={{ listStyle: "none" }} {...dropProps}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.25rem 1rem",
        }}
      >
        <IconButton
          ref={chevronRef}
          size="small"
          onClick={onToggleCollapsed}
          aria-expanded={!folder.isCollapsed}
          aria-controls={bodyId}
          aria-label={
            folder.isCollapsed
              ? `Expand ${folder.name}`
              : `Collapse ${folder.name}`
          }
          sx={{
            flexShrink: 0,
            padding: "0.125rem",
            color: theme.palette.text.primary,
            transition: theme.transitions.create("transform"),
            transform: folder.isCollapsed ? "rotate(-90deg)" : "none",
            ...focusRing(theme),
          }}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: "1.25rem" }} />
        </IconButton>

        {name}

        <Tooltip title="Folder actions">
          <IconButton
            size="small"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            aria-label={`Actions for ${folder.name}`}
            aria-haspopup="menu"
            sx={{
              flexShrink: 0,
              padding: "0.125rem",
              color: theme.palette.text.primary,
              ...focusRing(theme),
            }}
          >
            <MoreVertIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onStartRename();
            }}
          >
            <ListItemIcon>
              <EditOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>
              Rename folder
            </ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onUngroup();
            }}
          >
            <ListItemIcon>
              <FolderOffOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>
              Ungroup
            </ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Outside the Collapse, so a collapsed folder still shows the drop. */}
      {over && <DropIndicator />}

      <Collapse in={!folder.isCollapsed} id={bodyId}>
        {empty ? (
          <DashedEmptyState margin="0 1rem 0 2.5rem">
            Drag layers here
          </DashedEmptyState>
        ) : (
          <Box component="ul" sx={{ margin: 0, padding: 0 }}>
            {children}
          </Box>
        )}

        {/*
          Closes the folder off from what follows, inset to the row's own 1rem.
          Inside the Collapse so a closed folder loses it: outside, it would
          paint at zero height and leave a stray line.
        */}
        <Box
          sx={{
            margin: "0.5rem 1rem",
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        />
      </Collapse>
    </Box>
  );
}
