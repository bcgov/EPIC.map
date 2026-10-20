import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { CATALOGUE_DATASET_URL } from "@/utils/config";
import { hostedLayer, localLayerId } from "@/utils/localLayers";
import { isPendingId, nextPendingId } from "@/api/pendingIds";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const FAVOURITES_PATH = "/users/me/favourites";

export const FAVOURITES_KEY = epicMapQueryKey("users", "me", "favourites");

/** Shared by both toggles, so each can tell whether the other is still out. */
const TOGGLE_MUTATION_KEY = epicMapQueryKey(
  "users",
  "me",
  "favourites",
  "toggle",
);

interface FavouriteLayerResponse {
  id: number;
  source: string;
  package_id: string;
  object_name: string;
  display_name: string;
  description?: string | null;
  last_updated?: string | null;
  folder_id: number | null;
  sort_order: number;
  /** A favourite map-api put there for the user, which they may not remove. */
  restricted?: boolean;
}

export interface FavouriteLayer extends CatalogueLayer {
  /** Primary key of the row. */
  favouriteId: number;
  /** The folder it is filed in, or null for the top level. */
  folderId: number | null;
  /** Given rather than starred: it can be organised but not unstarred. */
  restricted: boolean;
}

/** A layer with something to draw. The API rejects one without. */
type MappableLayer = CatalogueLayer & { objectName: string };

const NO_FAVOURITES: readonly FavouriteLayer[] = [];

/**
 * A layer we host stores no catalogue package, so it is addressed by the object
 * name - the one thing that identifies it on both sides - and what the panel
 * shows about it is read from the hosted layer registry rather than the row.
 */
const isHosted = (row: FavouriteLayerResponse) => row.source === "local";

export const toFavouriteLayer = (
  row: FavouriteLayerResponse,
): FavouriteLayer => {
  const hosted = isHosted(row) ? hostedLayer(row.object_name) : undefined;

  return {
    id: isHosted(row) ? localLayerId(row.object_name) : `cat-${row.package_id}`,
    packageId: row.package_id,
    objectName: row.object_name,
    name: row.display_name,
    lastUpdated: row.last_updated ?? "",
    // A hosted layer describes itself from the registry; the row is the fallback.
    description: (hosted?.description ?? row.description) ?? null,
    metadataUrl: isHosted(row)
      ? hosted?.metadataUrl ?? null
      : `${CATALOGUE_DATASET_URL}/${row.package_id}`,
    favouriteId: row.id,
    folderId: row.folder_id ?? null,
    restricted: Boolean(row.restricted),
  };
};

/**
 * The layers the signed-in user has starred, persisted by map-api.
 *
 * The cache is written first, so the star fills under the pointer. A refused
 * call puts the list back. Newest first, the order map-api returns.
 */
export const useFavouriteLayers = () => {
  const { api } = useMapWidget();
  const queryClient = useQueryClient();

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const markPending = useCallback((layerId: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(layerId);
      else next.delete(layerId);
      return next;
    });
  }, []);

  const readCache = useCallback(
    () => queryClient.getQueryData<FavouriteLayer[]>(FAVOURITES_KEY) ?? [],
    [queryClient],
  );

  const writeCache = useCallback(
    (next: FavouriteLayer[]) => {
      queryClient.setQueryData(FAVOURITES_KEY, next);
    },
    [queryClient],
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: FAVOURITES_KEY,
    queryFn: async ({ signal }) => {
      const response = await api.get<FavouriteLayerResponse[]>(
        FAVOURITES_PATH,
        { signal },
      );
      // A row starred before details were stored has none, so keep what the
      // catalogue gave.
      const known = new Map(readCache().map((entry) => [entry.id, entry]));
      return response.data.map((row) => {
        const layer = toFavouriteLayer(row);
        const seen = known.get(layer.id);
        if (!seen) return layer;
        return {
          ...layer,
          lastUpdated: layer.lastUpdated || seen.lastUpdated,
          description: layer.description ?? seen.description,
        };
      });
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // An optimistic write cancels an in-flight GET, which may be the initial load.
  const settle = useCallback(() => {
    if (queryClient.isMutating({ mutationKey: TOGGLE_MUTATION_KEY }) > 1) return;
    queryClient.invalidateQueries({ queryKey: FAVOURITES_KEY });
  }, [queryClient]);

  const { mutate: addMutate } = useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: async (layer: MappableLayer) => {
      const response = await api.post<FavouriteLayerResponse>(FAVOURITES_PATH, {
        package_id: layer.packageId,
        object_name: layer.objectName,
        display_name: layer.name,
        description: layer.description,
        last_updated: layer.lastUpdated || null,
      });
      return response.data;
    },
    onMutate: async (layer) => {
      markPending(layer.id, true);
      await queryClient.cancelQueries({ queryKey: FAVOURITES_KEY });
      const previous = readCache();
      // Prepended, matching where map-api puts it.
      writeCache([
        // Starred by hand, so never a restricted one.
        { ...layer, favouriteId: nextPendingId(), folderId: null, restricted: false },
        ...previous.filter((entry) => entry.id !== layer.id),
      ]);
      return { previous };
    },
    onSuccess: (row, layer) => {
      // Only the id: the optimistic entry already holds the description and date.
      writeCache(
        readCache().map((entry) =>
          entry.id === layer.id ? { ...entry, favouriteId: row.id } : entry,
        ),
      );
    },
    onError: (_error, _layer, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: (_row, _error, layer) => {
      markPending(layer.id, false);
      settle();
    },
  });

  const { mutate: removeMutate } = useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: async (favourite: FavouriteLayer) => {
      await api.delete(`${FAVOURITES_PATH}/${favourite.favouriteId}`);
    },
    onMutate: async (favourite) => {
      markPending(favourite.id, true);
      await queryClient.cancelQueries({ queryKey: FAVOURITES_KEY });
      const previous = readCache();
      writeCache(previous.filter((entry) => entry.id !== favourite.id));
      return { previous };
    },
    onError: (_error, _favourite, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: (_data, _error, favourite) => {
      markPending(favourite.id, false);
      settle();
    },
  });

  const { mutate: moveMutate } = useMutation({
    mutationFn: async ({
      favourite,
      folderId,
    }: {
      favourite: FavouriteLayer;
      folderId: number | null;
    }) => {
      const response = await api.patch<FavouriteLayerResponse>(
        `${FAVOURITES_PATH}/${favourite.favouriteId}`,
        { folder_id: folderId },
      );
      return response.data;
    },
    onMutate: async ({ favourite, folderId }) => {
      await queryClient.cancelQueries({ queryKey: FAVOURITES_KEY });
      const previous = readCache();
      // Moved to the front, so it lands at the top of its new container, where
      // map-api puts it, rather than jumping there when the refetch lands.
      const current =
        previous.find((entry) => entry.id === favourite.id) ?? favourite;
      writeCache([
        { ...current, folderId },
        ...previous.filter((entry) => entry.id !== favourite.id),
      ]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FAVOURITES_KEY });
    },
  });

  const addFavourite = useCallback(
    (layer: CatalogueLayer) => {
      const { objectName } = layer;
      // The API needs an object name, so a dataset without one cannot be starred.
      if (!objectName) return;
      addMutate({ ...layer, objectName });
    },
    [addMutate],
  );

  const removeFavourite = useCallback(
    (layerId: string) => {
      const favourite = readCache().find((entry) => entry.id === layerId);
      // A star still waiting on its POST has no row id to delete yet.
      if (!favourite || isPendingId(favourite.favouriteId)) return;
      // map-api refuses it, and the row would come straight back on the refetch.
      if (favourite.restricted) return;
      removeMutate(favourite);
    },
    [readCache, removeMutate],
  );

  /** True when the move was sent, so only a real one is announced. */
  const moveFavourite = useCallback(
    (layerId: string, folderId: number | null): boolean => {
      const favourite = readCache().find((entry) => entry.id === layerId);
      // A star still waiting on its POST has no row id to file yet.
      if (!favourite || isPendingId(favourite.favouriteId)) return false;
      // Nor a folder to file it into until that folder's POST lands.
      if (isPendingId(folderId)) return false;
      // Dropping a layer back where it already is is not a change.
      if (favourite.folderId === folderId) return false;
      moveMutate({ favourite, folderId });
      return true;
    },
    [readCache, moveMutate],
  );

  const favourites = useMemo(() => data ?? NO_FAVOURITES, [data]);

  return {
    favourites,
    isPending,
    error,
    pendingIds,
    retry: refetch,
    addFavourite,
    removeFavourite,
    moveFavourite,
  };
};
