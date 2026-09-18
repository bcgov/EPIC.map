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
  hideWmsLayer,
  setWmsLayerOpacity,
  showWmsLayer,
} from "@/components/Layers/wmsLayers";
import { DEFAULT_LAYER_OPACITY, MAX_VISIBLE_LAYERS } from "@/utils/config";

interface LayersContextValue {
  map: MapLibreMap | null;
  visibleIds: ReadonlySet<string>;
  /** The layers map-api has stored for this user, bottom of the stack first. */
  appliedLayers: readonly AppliedLayer[];
  appliedPending: boolean;
  appliedError: unknown;
  retryApplied: () => void;
  /** Ids with a call in flight, whose switch is held until it lands. */
  pendingIds: ReadonlySet<string>;
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
  createFolder: (name: string) => void;
  renameFolder: (folderId: number, name: string) => void;
  setFolderCollapsed: (folderId: number, isCollapsed: boolean) => void;
  deleteFolder: (folderId: number) => void;
  ungroupFolder: (folderId: number) => void;
  /** File a favourite into a folder, or back out to the top level with null. */
  moveFavourite: (layerId: string, folderId: number | null) => void;
  expandedId: string | null;
  opacities: Readonly<Record<string, number>>;
  atVisibleLimit: boolean;
  toggleVisible: (layer: CatalogueLayer) => void;
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
    ungroupFolder,
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

      if (drawn === undefined) showWmsLayer(map, layer, opacity);
      else if (drawn !== opacity) setWmsLayerOpacity(map, layer.id, opacity);
    }

    const applied = new Set(appliedLayers.map((layer) => layer.id));
    for (const layerId of painted.keys()) {
      if (applied.has(layerId)) continue;
      painted.delete(layerId);
      hideWmsLayer(map, layerId);
    }
  }, [map, appliedLayers]);

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
      ungroupFolder,
      moveFavourite,
      expandedId,
      opacities,
      atVisibleLimit,
      toggleVisible,
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
      ungroupFolder,
      moveFavourite,
      expandedId,
      opacities,
      atVisibleLimit,
      toggleVisible,
      toggleFavourite,
      toggleExpanded,
      setOpacity,
    ],
  );

  return (
    <LayersContext.Provider value={value}>{children}</LayersContext.Provider>
  );
}

export const useLayers = (): LayersContextValue => {
  const value = useContext(LayersContext);
  if (!value) {
    throw new Error("useLayers must be used inside a LayersProvider");
  }
  return value;
};
