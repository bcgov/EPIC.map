import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isPendingId, nextPendingId } from "@/api/pendingIds";
import { FAVOURITES_KEY } from "@/api/useFavouriteLayers";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const FOLDERS_PATH = "/users/me/favourites/folders";

export const FOLDERS_KEY = epicMapQueryKey(
  "users",
  "me",
  "favourites",
  "folders",
);

interface FavouriteFolderResponse {
  id: number;
  name: string;
  is_collapsed: boolean;
  sort_order: number;
}

export interface FavouriteFolder {
  /** Primary key of the row, and what every folder call addresses. */
  folderId: number;
  name: string;
  isCollapsed: boolean;
}

/** What an unnamed folder is called, matching the fallback map-api applies. */
export const DEFAULT_FOLDER_NAME = "Untitled folder";

const NO_FOLDERS: readonly FavouriteFolder[] = [];

export const toFavouriteFolder = (
  row: FavouriteFolderResponse,
): FavouriteFolder => ({
  folderId: row.id,
  name: row.name,
  isCollapsed: row.is_collapsed,
});

/**
 * The folders the signed-in user has filed their favourites into, newest first.
 *
 * Every change writes the cache first, so a rename or a chevron lands under the
 * pointer rather than after a round trip. A refused call puts the folder back.
 */
export const useFavouriteFolders = () => {
  const { api } = useMapWidget();
  const queryClient = useQueryClient();

  const readCache = useCallback(
    () => queryClient.getQueryData<FavouriteFolder[]>(FOLDERS_KEY) ?? [],
    [queryClient],
  );

  const writeCache = useCallback(
    (next: FavouriteFolder[]) => {
      queryClient.setQueryData(FOLDERS_KEY, next);
    },
    [queryClient],
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async ({ signal }) => {
      const response = await api.get<FavouriteFolderResponse[]>(FOLDERS_PATH, {
        signal,
      });
      return response.data.map(toFavouriteFolder);
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { mutate: createMutate } = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post<FavouriteFolderResponse>(FOLDERS_PATH, {
        name,
      });
      return response.data;
    },
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });
      const previous = readCache();
      // Its own id, so a second folder in flight is not overwritten by this.
      const pendingId = nextPendingId();
      // Prepended, matching where map-api puts it.
      writeCache([
        {
          folderId: pendingId,
          name: name.trim() || DEFAULT_FOLDER_NAME,
          isCollapsed: false,
        },
        ...previous,
      ]);
      return { previous, pendingId };
    },
    onSuccess: (row, _name, context) => {
      writeCache(
        readCache().map((folder) =>
          folder.folderId === context.pendingId
            ? toFavouriteFolder(row)
            : folder,
        ),
      );
    },
    onError: (_error, _name, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });

  const { mutate: updateMutate } = useMutation({
    mutationFn: async ({
      folderId,
      body,
    }: {
      folderId: number;
      body: { name?: string; is_collapsed?: boolean };
    }) => {
      await api.patch(`${FOLDERS_PATH}/${folderId}`, body);
    },
    onMutate: async ({ folderId, body }) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });
      const previous = readCache();
      writeCache(
        previous.map((folder) =>
          folder.folderId === folderId
            ? {
                ...folder,
                ...(body.name !== undefined && {
                  name: body.name.trim() || DEFAULT_FOLDER_NAME,
                }),
                ...(body.is_collapsed !== undefined && {
                  isCollapsed: body.is_collapsed,
                }),
              }
            : folder,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });

  const { mutate: deleteMutate } = useMutation({
    mutationFn: async (folderId: number) => {
      await api.delete(`${FOLDERS_PATH}/${folderId}`);
    },
    onMutate: async (folderId) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY });
      const previous = readCache();
      writeCache(previous.filter((folder) => folder.folderId !== folderId));
      return { previous };
    },
    onError: (_error, _folderId, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      // The layers inside came back out to the top level.
      queryClient.invalidateQueries({ queryKey: FAVOURITES_KEY });
    },
  });

  const { mutate: ungroupMutate } = useMutation({
    mutationFn: async (folderId: number) => {
      await api.post(`${FOLDERS_PATH}/${folderId}/ungroup`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FAVOURITES_KEY });
    },
  });

  const createFolder = useCallback(
    (name: string) => createMutate(name),
    [createMutate],
  );

  const renameFolder = useCallback(
    (folderId: number, name: string) => {
      // A folder still waiting on its POST has no row id to rename yet.
      if (isPendingId(folderId)) return;
      updateMutate({ folderId, body: { name } });
    },
    [updateMutate],
  );

  const setFolderCollapsed = useCallback(
    (folderId: number, isCollapsed: boolean) => {
      if (isPendingId(folderId)) return;
      updateMutate({ folderId, body: { is_collapsed: isCollapsed } });
    },
    [updateMutate],
  );

  const deleteFolder = useCallback(
    (folderId: number) => {
      if (isPendingId(folderId)) return;
      deleteMutate(folderId);
    },
    [deleteMutate],
  );

  const ungroupFolder = useCallback(
    (folderId: number) => {
      if (isPendingId(folderId)) return;
      ungroupMutate(folderId);
    },
    [ungroupMutate],
  );

  return {
    folders: data ?? NO_FOLDERS,
    isPending,
    error,
    retry: refetch,
    createFolder,
    renameFolder,
    setFolderCollapsed,
    deleteFolder,
    ungroupFolder,
  };
};
