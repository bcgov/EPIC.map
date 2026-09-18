import { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import { DEFAULT_FOLDER_NAME } from "@/api/useFavouriteFolders";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import DropIndicator from "@/components/Layers/Favourites/DropIndicator";
import FolderRow from "@/components/Layers/Favourites/FolderRow";
import { groupByFolder } from "@/components/Layers/Favourites/grouping";
import { useFavouriteDropTarget } from "@/components/Layers/Favourites/useFavouriteDropTarget";
import LayerRow from "@/components/Layers/LayerRow";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";

/** The folder being typed into: a new one not yet saved, or a saved one renamed. */
type Editing =
  | { kind: "draft" }
  | { kind: "rename"; folderId: number }
  | null;

/**
 * Layers the user has starred, restored from map-api, grouped into folders.
 *
 * A new folder is local until its name is committed, so Escape discards it
 * without ever reaching the API.
 */
export default function FavouritesSection() {
  const theme = useTheme();
  const {
    favourites,
    favouritesPending,
    favouritesError,
    retryFavourites,
    folders,
    foldersError,
    retryFolders,
    createFolder,
    renameFolder,
    setFolderCollapsed,
    deleteFolder,
    ungroupFolder,
    moveFavourite,
  } = useLayers();

  const [editing, setEditing] = useState<Editing>(null);

  const toTopLevel = useCallback(
    (layerId: string) => moveFavourite(layerId, null),
    [moveFavourite],
  );
  const { over: overTopLevel, dropProps } = useFavouriteDropTarget(toTopLevel);

  // One draft at a time: a second click would leave two blank folders to name.
  const newFolder = useCallback(() => {
    setEditing((current) => (current?.kind === "draft" ? current : { kind: "draft" }));
  }, []);

  const commitDraft = useCallback(
    (name: string) => {
      setEditing(null);
      createFolder(name);
    },
    [createFolder],
  );

  const commitRename = useCallback(
    (folderId: number, name: string) => {
      setEditing(null);
      renameFolder(folderId, name);
    },
    [renameFolder],
  );

  // A layer whose folder is missing falls back to the top level. See grouping.
  const { topLevel, inFolder } = useMemo(
    () => groupByFolder(favourites, folders),
    [favourites, folders],
  );

  const rows = (layers: typeof favourites) =>
    layers.map((layer) => <LayerRow key={layer.id} layer={layer} draggable />);

  const folderList = () =>
    folders.map((folder) => {
      const inside = inFolder.get(folder.folderId) ?? [];
      return (
        <FolderRow
          key={folder.folderId}
          folder={folder}
          editing={
            editing?.kind === "rename" && editing.folderId === folder.folderId
          }
          empty={inside.length === 0}
          onStartRename={() =>
            setEditing({ kind: "rename", folderId: folder.folderId })
          }
          onCommitName={(name) => commitRename(folder.folderId, name)}
          onCancelEdit={() => setEditing(null)}
          onToggleCollapsed={() =>
            setFolderCollapsed(folder.folderId, !folder.isCollapsed)
          }
          onUngroup={() => ungroupFolder(folder.folderId)}
          onDelete={() => deleteFolder(folder.folderId)}
          onDropLayer={(layerId) => moveFavourite(layerId, folder.folderId)}
        >
          {rows(inside)}
        </FolderRow>
      );
    });

  const draftFolder = () =>
    editing?.kind === "draft" ? (
      <FolderRow
        folder={{
          folderId: 0,
          name: DEFAULT_FOLDER_NAME,
          isCollapsed: false,
        }}
        editing
        empty
        onStartRename={() => undefined}
        onCommitName={commitDraft}
        onCancelEdit={() => setEditing(null)}
        onToggleCollapsed={() => undefined}
        onUngroup={() => undefined}
        onDelete={() => setEditing(null)}
        // A folder that does not exist yet cannot be filed into.
        onDropLayer={() => undefined}
      />
    ) : null;

  /**
   * Folders first, then the favourites filed in none of them.
   *
   * The list is the top level's drop target, so dropping outside a folder takes
   * a layer out of one. Folders stop the event, so their drops never reach here.
   */
  const favouriteList = () => (
    <Box component="ul" {...dropProps} sx={{ margin: 0, padding: 0 }}>
      {draftFolder()}
      {folderList()}
      {/* Below the folders: a layer leaving one lands atop the ungrouped rows. */}
      {overTopLevel && <DropIndicator />}
      {rows(topLevel)}
    </Box>
  );

  /**
   * The folders call failed.
   *
   * A failed refetch keeps the folders already cached, so the grouping is only
   * stale. With nothing cached it is gone and the layers have fallen back to
   * the top level, which is worth saying: otherwise it reads as a deletion.
   */
  const foldersNotice = () => (
    <Box sx={{ padding: "0 1rem 0.5rem" }}>
      <Typography
        sx={{
          fontSize: theme.typography.caption.fontSize,
          // Set with the size: the default is body1's, for larger text.
          lineHeight: 1.4,
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
        {folders.length > 0
          ? "Couldn’t refresh your folders."
          : "Couldn’t load your folders. Your layers are shown ungrouped."}{" "}
        {/* In the sentence, not a button under it: the retry is part of it. */}
        <Link
          component="button"
          type="button"
          onClick={retryFolders}
          sx={{
            // A native button takes the UA font, not the paragraph's.
            font: "inherit",
            // MUI centres a button-as-link; a word in a sentence needs baseline.
            verticalAlign: "baseline",
            color: theme.palette.primary.dark,
            textDecorationColor: "currentcolor",
          }}
        >
          Try again
        </Link>
        .
      </Typography>
    </Box>
  );

  const content = () => {
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

    // A folder on its own is worth showing: it is where the next star goes.
    if (!stale && folders.length === 0 && editing?.kind !== "draft") {
      return (
        <DashedEmptyState>
          No favourites yet. Star a layer from the BC Data Catalogue to pin it
          here.
        </DashedEmptyState>
      );
    }

    return favouriteList();
  };

  // Above the favourites' own message: separate calls, so both can fail.
  const body = () => (
    <>
      {foldersError ? foldersNotice() : null}
      {content()}
    </>
  );

  return (
    <LayersSection
      id="epic-map-layers-favourites"
      title="Favourites"
      count={favourites.length}
      action={
        <Tooltip title="New folder">
          <IconButton size="small" aria-label="New folder" onClick={newFolder}>
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
