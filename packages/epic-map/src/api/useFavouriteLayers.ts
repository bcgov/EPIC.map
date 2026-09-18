import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { CATALOGUE_DATASET_URL } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const FAVOURITES_PATH = "/users/me/favourites";

const FAVOURITES_KEY = epicMapQueryKey("users", "me", "favourites");

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
  sort_order: number;
}

export interface FavouriteLayer extends CatalogueLayer {
  /** Primary key of the row. */
  favouriteId: number;
}

/** A layer with something to draw. The API rejects one without. */
type MappableLayer = CatalogueLayer & { objectName: string };

/** Stands in for the row id between the star filling and the POST returning. */
const PENDING_FAVOURITE_ID = -1;

const NO_FAVOURITES: readonly FavouriteLayer[] = [];

export const toFavouriteLayer = (
  row: FavouriteLayerResponse,
): FavouriteLayer => ({
  id: `cat-${row.package_id}`,
  packageId: row.package_id,
  objectName: row.object_name,
  name: row.display_name,
  lastUpdated: "",
  description: null,
  metadataUrl: `${CATALOGUE_DATASET_URL}/${row.package_id}`,
  favouriteId: row.id,
});

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
      // A stored row has no description or date, so keep what the catalogue gave.
      const known = new Map(readCache().map((entry) => [entry.id, entry]));
      return response.data.map((row) => {
        const layer = toFavouriteLayer(row);
        const seen = known.get(layer.id);
        if (!seen) return layer;
        return {
          ...layer,
          lastUpdated: seen.lastUpdated,
          description: seen.description,
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
      });
      return response.data;
    },
    onMutate: async (layer) => {
      markPending(layer.id, true);
      await queryClient.cancelQueries({ queryKey: FAVOURITES_KEY });
      const previous = readCache();
      // Prepended, matching where map-api puts it.
      writeCache([
        { ...layer, favouriteId: PENDING_FAVOURITE_ID },
        ...previous.filter((entry) => entry.id !== layer.id),
      ]);
      return { previous };
    },
    onSuccess: (row, layer) => {
      // Only the id: the optimistic entry holds the catalogue description and date.
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
      if (!favourite || favourite.favouriteId === PENDING_FAVOURITE_ID) return;
      removeMutate(favourite);
    },
    [readCache, removeMutate],
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
  };
};
