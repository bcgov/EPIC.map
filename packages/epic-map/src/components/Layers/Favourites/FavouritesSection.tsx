import { useCallback, useEffect, useMemo, useState } from "react";
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
import { isPendingId } from "@/api/pendingIds";
import { DEFAULT_FOLDER_NAME } from "@/api/useFavouriteFolders";
import type { FavouriteLayer } from "@/api/useFavouriteLayers";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import DropIndicator from "@/components/Layers/Favourites/DropIndicator";
import FolderRow from "@/components/Layers/Favourites/FolderRow";
import {
  groupByFolder,
  moveDestinations,
  TOP_LEVEL_NAME,
} from "@/components/Layers/Favourites/grouping";
import MoveToGroupMenu from "@/components/Layers/Favourites/MoveToGroupMenu";
import { useFavouriteDropTarget } from "@/components/Layers/Favourites/useFavouriteDropTarget";
import LayerRow from "@/components/Layers/LayerRow";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";
import { MAX_FAVOURITE_FOLDERS } from "@/utils/config";

/** The folder being typed into, and the layer a draft was opened to file. */
type Editing =
  | { kind: "draft"; layer?: FavouriteLayer }
  | { kind: "rename"; folderId: number }
  | null;

/** A layer held in the folder it is headed for, while that folder saves. */
type Filing = { layerId: string; folderId: number } | null;

/** Where focus goes after a menu move remounts the row. */
type FocusAfterMove =
  | { kind: "layer"; layerId: string }
  | { kind: "folder"; folderId: number }
  | null;

/** Read by a screen reader, seen by no one. */
const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

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
    favouritePendingIds,
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
    folderSaveError,
    clearFolderSaveError,
    moveFavourite,
  } = useLayers();

  const [editing, setEditing] = useState<Editing>(null);
  const [filing, setFiling] = useState<Filing>(null);
  const [focusAfterMove, setFocusAfterMove] = useState<FocusAfterMove>(null);
  // Counted, so the same sentence twice still announces.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const atFolderCap = folders.length >= MAX_FAVOURITE_FOLDERS;

  const [moveError, setMoveError] = useState<string | null>(null);

  const clearFocusAfterMove = useCallback(() => setFocusAfterMove(null), []);

  const announce = useCallback((text: string) => {
    setAnnouncement((current) => ({ text, count: current.count + 1 }));
  }, []);

  const reportProblem = useCallback(
    (text: string) => {
      setMoveError(text);
      announce(text);
    },
    [announce],
  );

  /** Every move, by menu or by drag, is announced here. */
  const moveTo = useCallback(
    (layerId: string, folderId: number | null, groupName: string) => {
      const moved = moveFavourite(layerId, folderId);
      if (moved) {
        const layer = favourites.find((entry) => entry.id === layerId);
        announce(`Moved ${layer?.name ?? "layer"} to ${groupName}`);
      }
      return moved;
    },
    [moveFavourite, favourites, announce],
  );

  const toTopLevel = useCallback(
    (layerId: string) => moveTo(layerId, null, TOP_LEVEL_NAME),
    [moveTo],
  );
  const { over: overTopLevel, dropProps } = useFavouriteDropTarget(toTopLevel);

  // The move has written the cache, so the layer no longer needs holding.
  useEffect(() => {
    setFiling((current) =>
      current && !isPendingId(current.folderId) ? null : current,
    );
  }, [favourites]);

  // One draft at a time: a second click would leave two blank folders to name.
  const newFolder = useCallback(() => {
    setEditing((current) => (current?.kind === "draft" ? current : { kind: "draft" }));
  }, []);

  const commitDraft = useCallback(
    (name: string, layer?: FavouriteLayer) => {
      setEditing(null);
      const { pendingId, saved } = createFolder(name);
      if (!layer) return;

      // Held in the new folder while it saves, rather than jumping out.
      setFiling({ layerId: layer.id, folderId: pendingId });
      const groupName = name.trim() || DEFAULT_FOLDER_NAME;
      saved.then((folderId) => {
        if (folderId !== null && moveTo(layer.id, folderId, groupName)) {
          setFiling({ layerId: layer.id, folderId });
          return;
        }
        // It has just left the folder it was shown in, which needs saying.
        setFiling(null);
        if (folderId === null) {
          // The folder's own failure is reported by folderSaveError as well.
          announce(`Couldn’t create ${groupName}. ${layer.name} did not move.`);
        } else {
          reportProblem(`Couldn’t move ${layer.name} into ${groupName} folder.`);
        }
      });
    },
    [createFolder, moveTo, announce, reportProblem],
  );

  const commitRename = useCallback(
    (folderId: number, name: string) => {
      setEditing(null);
      renameFolder(folderId, name);
    },
    [renameFolder],
  );

  const draftLayer = editing?.kind === "draft" ? editing.layer : undefined;

  // A layer whose folder is missing falls back to the top level. See grouping.
  const { topLevel, inFolder } = useMemo(() => {
    const shown = favourites
      // Shown inside the draft instead.
      .filter((layer) => layer.id !== draftLayer?.id)
      .map((layer) =>
        layer.id === filing?.layerId
          ? { ...layer, folderId: filing.folderId }
          : layer,
      );
    return groupByFolder(shown, folders);
  }, [favourites, folders, draftLayer, filing]);

  const moveFromMenu = (layer: FavouriteLayer, folderId: number | null) => {
    const destination = folders.find((folder) => folder.folderId === folderId);
    const groupName = destination?.name ?? TOP_LEVEL_NAME;
    if (!moveTo(layer.id, folderId, groupName)) return;
    // A closed folder hides the row, so its header takes focus instead.
    setFocusAfterMove(
      destination?.isCollapsed
        ? { kind: "folder", folderId: destination.folderId }
        : { kind: "layer", layerId: layer.id },
    );
  };

  const rows = (layers: readonly FavouriteLayer[]) =>
    layers.map((layer) => (
      <LayerRow
        key={layer.id}
        layer={layer}
        draggable
        menu={(controls) => (
          <MoveToGroupMenu
            {...controls}
            layerName={layer.name}
            destinations={moveDestinations(layer.folderId, folders)}
            onMove={(destination) => moveFromMenu(layer, destination.folderId)}
            onNewFolder={() => setEditing({ kind: "draft", layer })}
            atFolderCap={atFolderCap}
            saving={favouritePendingIds.has(layer.id)}
          />
        )}
        focusMenuButton={
          focusAfterMove?.kind === "layer" && focusAfterMove.layerId === layer.id
        }
        onMenuButtonFocused={clearFocusAfterMove}
      />
    ));

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
          onUngroup={() => deleteFolder(folder.folderId)}
          onDropLayer={(layerId) =>
            moveTo(layerId, folder.folderId, folder.name)
          }
          focusHeader={
            focusAfterMove?.kind === "folder" &&
            focusAfterMove.folderId === folder.folderId
          }
          onHeaderFocused={clearFocusAfterMove}
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
        empty={!draftLayer}
        onStartRename={() => undefined}
        onCommitName={(name) => commitDraft(name, draftLayer)}
        onCancelEdit={() => setEditing(null)}
        onToggleCollapsed={() => undefined}
        onUngroup={() => setEditing(null)}
        // A folder that does not exist yet cannot be filed into.
        onDropLayer={() => undefined}
      >
        {/* No menu or drag: the folder it is in does not exist yet. */}
        {draftLayer && <LayerRow layer={draftLayer} />}
      </FolderRow>
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

  // A warning with its action as a link at the end of the sentence.
  const warningLine = (message: string, action: string, onAction: () => void) => (
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
        {message}{" "}
        <Link
          component="button"
          type="button"
          onClick={onAction}
          sx={{
            // A native button takes the UA font, not the paragraph's.
            font: "inherit",
            // MUI centres a button-as-link; a word in a sentence needs baseline.
            verticalAlign: "baseline",
            color: theme.palette.primary.dark,
            textDecorationColor: "currentcolor",
          }}
        >
          {action}
        </Link>
        .
      </Typography>
    </Box>
  );

  /**
   * The folders call failed.
   *
   * A failed refetch keeps the folders already cached, so the grouping is only
   * stale. With nothing cached it is gone and the layers have fallen back to
   * the top level, which is worth saying: otherwise it reads as a deletion.
   */
  const foldersNotice = () =>
    warningLine(
      folders.length > 0
        ? "Couldn’t refresh your folders."
        : "Couldn’t load your folders. Your layers are shown ungrouped.",
      "Try again",
      retryFolders,
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
      {/* Always mounted: a live region only speaks when its text changes. */}
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        <span key={announcement.count}>{announcement.text}</span>
      </Box>
      {foldersError ? foldersNotice() : null}
      {folderSaveError
        ? warningLine(folderSaveError, "Dismiss", clearFolderSaveError)
        : null}
      {moveError
        ? warningLine(moveError, "Dismiss", () => setMoveError(null))
        : null}
      {content()}
    </>
  );

  return (
    <LayersSection
      id="epic-map-layers-favourites"
      title="Favourites"
      count={favourites.length}
      action={
        <Tooltip
          title={
            atFolderCap
              ? `Folder limit reached (${MAX_FAVOURITE_FOLDERS})`
              : "New folder"
          }
        >
          {/* A disabled button fires no events, so the tooltip needs a wrapper. */}
          <span>
            <IconButton
              size="small"
              aria-label="New folder"
              onClick={newFolder}
              disabled={atFolderCap}
            >
              <CreateNewFolderOutlinedIcon
                sx={{
                  fontSize: "1.25rem",
                  color: atFolderCap ? "action.disabled" : "primary.main",
                }}
              />
            </IconButton>
          </span>
        </Tooltip>
      }
    >
      {body()}
    </LayersSection>
  );
}
