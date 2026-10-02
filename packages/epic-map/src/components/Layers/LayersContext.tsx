import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useAppliedLayers, type AppliedLayer } from "@/api/useAppliedLayers";
import { useLayerFocus } from "@/api/useLayerFocus";
import { useLayerMinZooms } from "@/api/useLayerMinZooms";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  useFavouriteFolders,
  type FavouriteFolder,
} from "@/api/useFavouriteFolders";
import {
  useFavouriteLayers,
  type FavouriteLayer,
} from "@/api/useFavouriteLayers";
import {
  hideOutlineLayer,
  hideWmsLayer,
  layersBelowFloor,
  setOutlineLayerMaxZoom,
  setWmsLayerMinZoom,
  setWmsLayerOpacity,
  showOutlineLayer,
  showWmsLayer,
} from "@/components/Layers/layerUtils";
import { ImportedLayersProvider } from "@/components/Layers/UserLayers/ImportedLayersContext";
import {
  DEFAULT_LAYER_OPACITY,
  effectiveMinZoom,
  isBeyondMapZoom,
  MAX_VISIBLE_LAYERS,
} from "@/utils/config";

interface LayersContextValue {
  map: MapLibreMap | null;
  visibleIds: ReadonlySet<string>;
  /** The layers map-api has stored for this user, bottom of the stack first. */
  appliedLayers: readonly AppliedLayer[];
  appliedPending: boolean;
  appliedError: unknown;
  retryApplied: () => void;
  pendingIds: ReadonlySet<string>;
  focusPendingIds: ReadonlySet<string>;
  /** Why the last press of "Zoom in to view" did not move the map, by layer. */
  focusErrors: Readonly<Record<string, string>>;
  focusLayer: (layer: CatalogueLayer) => void;
  belowFloorIds: ReadonlySet<string>;
  /** The zoom each enabled layer starts drawing at, by layer id. */
  layerFloors: Readonly<Record<string, number>>;
  /** Enabled layers whose floor is past anything the map can zoom to. */
  beyondReachIds: ReadonlySet<string>;
  /** The layers map-api has starred for this user, newest first. */
  favourites: readonly FavouriteLayer[];
  favouritesPending: boolean;
  favouritesError: unknown;
  retryFavourites: () => void;
  /** Ids with a star call in flight, whose star is held until it lands. */
  favouritePendingIds: ReadonlySet<string>;
  /** The folders the user has filed favourites into, newest first. */
  folders: readonly FavouriteFolder[];
  foldersPending: boolean;
  foldersError: unknown;
  retryFolders: () => void;
  /** The folder's pending id now, its real id (or null) once saved. */
  createFolder: (name: string) => {
    pendingId: number;
    saved: Promise<number | null>;
  };
  renameFolder: (folderId: number, name: string) => void;
  setFolderCollapsed: (folderId: number, isCollapsed: boolean) => void;
  /** Ungroup: removes the folder and moves its layers to the top level. */
  deleteFolder: (folderId: number) => void;
  /** Why the last folder change was rolled back, or null. */
  folderSaveError: string | null;
  clearFolderSaveError: () => void;
  /** File a favourite into a folder, or with null back out to the top level. */
  moveFavourite: (layerId: string, folderId: number | null) => boolean;
  expandedId: string | null;
  opacities: Readonly<Record<string, number>>;
  atVisibleLimit: boolean;
  toggleVisible: (layer: CatalogueLayer) => void;
  /** Switches off every enabled layer. */
  turnAllOff: () => void;
  toggleFavourite: (layer: CatalogueLayer) => void;
  toggleExpanded: (layerId: string) => void;
  setOpacity: (layerId: string, percent: number) => void;
}

const LayersContext = createContext<LayersContextValue | null>(null);

export function LayersProvider({
  map,
  children,
}: {
  map: MapLibreMap | null;
  children: ReactNode;
}) {
  const {
    layers: appliedLayers,
    isPending: appliedPending,
    error: appliedError,
    pendingIds,
    retry,
    applyLayer,
    removeLayer,
    saveOpacity,
  } = useAppliedLayers();

  const {
    focusLayer: focusLayerAt,
    focusPendingIds,
    focusErrors,
  } = useLayerFocus();

  const appliedObjectNames = useMemo(
    () =>
      appliedLayers
        .map((layer) => layer.objectName)
        .filter((name): name is string => Boolean(name)),
    [appliedLayers],
  );

  const minZooms = useLayerMinZooms(appliedObjectNames);

  const floors = useMemo(
    () =>
      appliedLayers.map((layer) => ({
        id: layer.id,
        floor: effectiveMinZoom(
          layer.objectName ? minZooms[layer.objectName] : undefined,
        ),
      })),
    [appliedLayers, minZooms],
  );

  const layerFloors = useMemo(
    () => Object.fromEntries(floors.map(({ id, floor }) => [id, floor])),
    [floors],
  );

  const [belowFloorIds, setBelowFloorIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      setBelowFloorIds((current) =>
        layersBelowFloor(floors, map.getZoom(), current),
      );
    };

    sync();
    map.on("zoom", sync);
    return () => {
      map.off("zoom", sync);
    };
  }, [map, floors]);

  const beyondReachIds = useMemo(
    () =>
      new Set(
        floors
          .filter(({ floor }) => isBeyondMapZoom(floor))
          .map(({ id }) => id),
      ),
    [floors],
  );


  const {
    favourites,
    isPending: favouritesPending,
    error: favouritesError,
    pendingIds: favouritePendingIds,
    retry: retryFavouritesQuery,
    addFavourite,
    removeFavourite,
    moveFavourite,
  } = useFavouriteLayers();

  const {
    folders,
    isPending: foldersPending,
    error: foldersError,
    retry: retryFoldersQuery,
    createFolder,
    renameFolder,
    setFolderCollapsed,
    deleteFolder,
    saveError: folderSaveError,
    clearSaveError: clearFolderSaveError,
  } = useFavouriteFolders();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [opacityDrafts, setOpacityDrafts] = useState<
    Readonly<Record<string, number>>
  >({});

  const visibleIds = useMemo(
    () => new Set(appliedLayers.map((layer) => layer.id)),
    [appliedLayers],
  );

  const opacities = useMemo(() => {
    const stored: Record<string, number> = {};
    for (const layer of appliedLayers) stored[layer.id] = layer.opacity;
    return { ...opacityDrafts, ...stored };
  }, [appliedLayers, opacityDrafts]);

  const opacitiesRef = useRef(opacities);
  opacitiesRef.current = opacities;

  const paintedRef = useRef<Map<string, number>>(new Map());
  const paintedMapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!map) return;

    if (paintedMapRef.current !== map) {
      paintedMapRef.current = map;
      paintedRef.current = new Map();
    }
    const painted = paintedRef.current;

    for (const layer of appliedLayers) {
      const opacity = opacitiesRef.current[layer.id] ?? DEFAULT_LAYER_OPACITY;
      const drawn = painted.get(layer.id);
      painted.set(layer.id, opacity);

      if (drawn === undefined) {
        showWmsLayer(map, layer, opacity);
        showOutlineLayer(map, layer);
      } else if (drawn !== opacity) {
        setWmsLayerOpacity(map, layer.id, opacity);
      }
    }

    const applied = new Set(appliedLayers.map((layer) => layer.id));
    for (const layerId of painted.keys()) {
      if (applied.has(layerId)) continue;
      painted.delete(layerId);
      hideWmsLayer(map, layerId);
      hideOutlineLayer(map, layerId);
    }
  }, [map, appliedLayers]);

  useEffect(() => {
    if (!map) return;

    for (const layer of appliedLayers) {
      if (!layer.objectName) continue;
      const minZoom = minZooms[layer.objectName];
      if (minZoom === undefined) continue;
      setWmsLayerMinZoom(map, layer.id, minZoom);
      setOutlineLayerMaxZoom(map, layer.id, minZoom);
    }
  }, [map, appliedLayers, minZooms]);

  const toggleVisible = useCallback(
    (layer: CatalogueLayer) => {
      if (pendingIds.has(layer.id)) return;
      if (visibleIds.has(layer.id)) {
        removeLayer(layer.id);
        return;
      }
      if (visibleIds.size >= MAX_VISIBLE_LAYERS) return;

      applyLayer(
        layer,
        opacitiesRef.current[layer.id] ?? DEFAULT_LAYER_OPACITY,
      );
    },
    [pendingIds, visibleIds, applyLayer, removeLayer],
  );

  const turnAllOff = useCallback(() => {
    for (const layer of appliedLayers) removeLayer(layer.id);
  }, [appliedLayers, removeLayer]);

  const favouriteIds = useMemo(
    () => new Set(favourites.map((favourite) => favourite.id)),
    [favourites],
  );

  const toggleFavourite = useCallback(
    (layer: CatalogueLayer) => {
      if (favouritePendingIds.has(layer.id)) return;
      if (favouriteIds.has(layer.id)) {
        removeFavourite(layer.id);
        return;
      }
      addFavourite(layer);
    },
    [favouritePendingIds, favouriteIds, addFavourite, removeFavourite],
  );

  const setOpacity = useCallback(
    (layerId: string, percent: number) => {
      setOpacityDrafts((current) => ({ ...current, [layerId]: percent }));

      if (map) {
        setWmsLayerOpacity(map, layerId, percent);
        if (paintedRef.current.has(layerId)) {
          paintedRef.current.set(layerId, percent);
        }
      }
      saveOpacity(layerId, percent);
    },
    [map, saveOpacity],
  );

  const focusLayer = useCallback(
    (layer: CatalogueLayer) => {
      if (!map || !layer.objectName) return;
      focusLayerAt(layer.id, layer.objectName, map, minZooms[layer.objectName]);
    },
    [map, focusLayerAt, minZooms],
  );

  const toggleExpanded = useCallback((layerId: string) => {
    setExpandedId((current) => (current === layerId ? null : layerId));
  }, []);

  const retryApplied = useCallback(() => {
    retry();
  }, [retry]);

  const retryFavourites = useCallback(() => {
    retryFavouritesQuery();
  }, [retryFavouritesQuery]);

  const retryFolders = useCallback(() => {
    retryFoldersQuery();
  }, [retryFoldersQuery]);

  const atVisibleLimit = visibleIds.size >= MAX_VISIBLE_LAYERS;

  const value = useMemo(
    () => ({
      map,
      visibleIds,
      appliedLayers,
      appliedPending,
      appliedError,
      retryApplied,
      pendingIds,
      focusPendingIds,
      focusErrors,
      focusLayer,
      belowFloorIds,
      layerFloors,
      beyondReachIds,
      favourites,
      favouritesPending,
      favouritesError,
      retryFavourites,
      favouritePendingIds,
      folders,
      foldersPending,
      foldersError,
      retryFolders,
      createFolder,
      renameFolder,
      setFolderCollapsed,
      deleteFolder,
      folderSaveError,
      clearFolderSaveError,
      moveFavourite,
      expandedId,
      opacities,
      atVisibleLimit,
      toggleVisible,
      turnAllOff,
      toggleFavourite,
      toggleExpanded,
      setOpacity,
    }),
    [
      map,
      visibleIds,
      appliedLayers,
      appliedPending,
      appliedError,
      retryApplied,
      pendingIds,
      focusPendingIds,
      focusErrors,
      focusLayer,
      belowFloorIds,
      layerFloors,
      beyondReachIds,
      favourites,
      favouritesPending,
      favouritesError,
      retryFavourites,
      favouritePendingIds,
      folders,
      foldersPending,
      foldersError,
      retryFolders,
      createFolder,
      renameFolder,
      setFolderCollapsed,
      deleteFolder,
      folderSaveError,
      clearFolderSaveError,
      moveFavourite,
      expandedId,
      opacities,
      atVisibleLimit,
      toggleVisible,
      turnAllOff,
      toggleFavourite,
      toggleExpanded,
      setOpacity,
    ],
  );

  return (
    <LayersContext.Provider value={value}>
      <ImportedLayersProvider map={map}>{children}</ImportedLayersProvider>
    </LayersContext.Provider>
  );
}

export const useLayers = (): LayersContextValue => {
  const value = useContext(LayersContext);
  if (!value) {
    throw new Error("useLayers must be used inside a LayersProvider");
  }
  return value;
};
