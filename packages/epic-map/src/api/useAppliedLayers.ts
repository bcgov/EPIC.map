import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  CATALOGUE_DATASET_URL,
  OPACITY_SAVE_DEBOUNCE_MS,
} from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

const APPLIED_LAYERS_PATH = "/users/me/layers";

const APPLIED_LAYERS_KEY = epicMapQueryKey("users", "me", "layers");

/** Shared by both toggles, so each can tell whether the other is still out. */
const TOGGLE_MUTATION_KEY = epicMapQueryKey("users", "me", "layers", "toggle");

interface AppliedLayerResponse {
  id: number;
  source: string;
  package_id: string;
  object_name: string;
  display_name: string;
  opacity: number;
  sort_order: number;
}

export interface AppliedLayer extends CatalogueLayer {
  /** Primary key of the row, and what PATCH and DELETE address. */
  appliedId: number;
  opacity: number;
}

/** A layer with something to draw. The API rejects one without it. */
type MappableLayer = CatalogueLayer & { objectName: string };

interface ApplyVariables {
  layer: MappableLayer;
  opacity: number;
}

interface OpacityVariables {
  appliedId: number;
  layerId: string;
  opacity: number;
  previous: number;
}

/** Stands in for the row id between the switch moving and the POST returning. */
const PENDING_APPLIED_ID = -1;

const NO_LAYERS: readonly AppliedLayer[] = [];

export const toAppliedLayer = (row: AppliedLayerResponse): AppliedLayer => ({
  id: `cat-${row.package_id}`,
  packageId: row.package_id,
  objectName: row.object_name,
  name: row.display_name,
  lastUpdated: "",
  description: null,
  metadataUrl: `${CATALOGUE_DATASET_URL}/${row.package_id}`,
  appliedId: row.id,
  opacity: row.opacity,
});

/**
 * The layers the signed-in user has switched on, persisted by map-api.
 *
 * Every change is written to the cache first, so the panel and the map move
 * with the control rather than a round trip behind it. A refused call puts the
 * list back; the axios instance has already told the host about the error.
 */
export const useAppliedLayers = () => {
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
    () => queryClient.getQueryData<AppliedLayer[]>(APPLIED_LAYERS_KEY) ?? [],
    [queryClient],
  );

  const writeCache = useCallback(
    (next: AppliedLayer[]) => {
      queryClient.setQueryData(APPLIED_LAYERS_KEY, next);
    },
    [queryClient],
  );

  const patchCache = useCallback(
    (layerId: string, changes: Partial<AppliedLayer>) => {
      writeCache(
        readCache().map((entry) =>
          entry.id === layerId ? { ...entry, ...changes } : entry,
        ),
      );
    },
    [readCache, writeCache],
  );

  // One timer per layer, so dragging two sliders in turn saves both.
  const opacityTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const savingOpacity = useRef(new Set<string>());

  const { data, isPending, error, refetch } = useQuery({
    queryKey: APPLIED_LAYERS_KEY,
    queryFn: async ({ signal }) => {
      const response = await api.get<AppliedLayerResponse[]>(
        APPLIED_LAYERS_PATH,
        { signal },
      );
      // A stored row keeps no description or modified date, so whatever the
      // catalogue already told us about a layer survives the refetch.
      const known = new Map(readCache().map((entry) => [entry.id, entry]));
      return response.data.map((row) => {
        const layer = toAppliedLayer(row);
        const seen = known.get(layer.id);
        if (!seen) return layer;
        return {
          ...layer,
          lastUpdated: seen.lastUpdated,
          description: seen.description,
          // A queued or in-flight save means the server has not stored this
          // layer's opacity yet, so its answer is stale and the slider is right.
          opacity:
            opacityTimers.current.has(layer.id) ||
              savingOpacity.current.has(layer.id)
              ? seen.opacity
              : layer.opacity,
        };
      });
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // An optimistic write cancels an in-flight GET, which on a first toggle can be
  // the initial load - this is what goes back for the rest of the user's layers.
  const settle = useCallback(() => {
    if (queryClient.isMutating({ mutationKey: TOGGLE_MUTATION_KEY }) > 1) return;
    queryClient.invalidateQueries({ queryKey: APPLIED_LAYERS_KEY });
  }, [queryClient]);

  const { mutate: applyMutate } = useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: async ({ layer, opacity }: ApplyVariables) => {
      const response = await api.post<AppliedLayerResponse>(
        APPLIED_LAYERS_PATH,
        {
          package_id: layer.packageId,
          object_name: layer.objectName,
          display_name: layer.name,
          opacity,
        },
      );
      return response.data;
    },
    onMutate: async ({ layer, opacity }) => {
      markPending(layer.id, true);
      await queryClient.cancelQueries({ queryKey: APPLIED_LAYERS_KEY });
      const previous = readCache();
      writeCache([
        ...previous,
        { ...layer, appliedId: PENDING_APPLIED_ID, opacity },
      ]);
      return { previous };
    },
    onSuccess: (row, { layer }) => {
      // Only the id is taken from the response: the optimistic entry carries the
      // description and date the catalogue gave us, which the row does not store.
      patchCache(layer.id, { appliedId: row.id });
    },
    onError: (_error, _variables, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: (_row, _error, { layer }) => {
      markPending(layer.id, false);
      settle();
    },
  });

  const { mutate: removeMutate } = useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: async (layer: AppliedLayer) => {
      await api.delete(`${APPLIED_LAYERS_PATH}/${layer.appliedId}`);
    },
    onMutate: async (layer) => {
      markPending(layer.id, true);
      await queryClient.cancelQueries({ queryKey: APPLIED_LAYERS_KEY });
      const previous = readCache();
      writeCache(previous.filter((entry) => entry.id !== layer.id));
      return { previous };
    },
    onError: (_error, _layer, context) => {
      if (context) writeCache(context.previous);
    },
    onSettled: (_data, _error, layer) => {
      markPending(layer.id, false);
      settle();
    },
  });

  const { mutate: opacityMutate } = useMutation({
    mutationFn: async ({ appliedId, opacity }: OpacityVariables) => {
      await api.patch(`${APPLIED_LAYERS_PATH}/${appliedId}`, { opacity });
    },
    onError: (_error, { layerId, previous }) => {
      patchCache(layerId, { opacity: previous });
    },
    onSettled: (_data, _error, { layerId }) => {
      savingOpacity.current.delete(layerId);
    },
  });

  const cancelOpacitySave = useCallback((layerId: string) => {
    const timer = opacityTimers.current.get(layerId);
    if (timer === undefined) return;
    clearTimeout(timer);
    opacityTimers.current.delete(layerId);
  }, []);

  useEffect(() => {
    const timers = opacityTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const saveOpacityRef = useRef<(layerId: string, percent: number) => void>();

  const saveOpacity = useCallback(
    (layerId: string, percent: number) => {
      const applied = readCache().find((entry) => entry.id === layerId);

      if (!applied) return;

      const previous = applied.opacity;
      patchCache(layerId, { opacity: percent });

      cancelOpacitySave(layerId);
      opacityTimers.current.set(
        layerId,
        setTimeout(() => {
          opacityTimers.current.delete(layerId);

          const row = readCache().find((entry) => entry.id === layerId);
          if (!row) return;
          if (row.appliedId === PENDING_APPLIED_ID) {
            saveOpacityRef.current?.(layerId, percent);
            return;
          }
          savingOpacity.current.add(layerId);
          opacityMutate({
            appliedId: row.appliedId,
            layerId,
            previous,
            opacity: percent,
          });
        }, OPACITY_SAVE_DEBOUNCE_MS),
      );
    },
    [readCache, patchCache, cancelOpacitySave, opacityMutate],
  );

  saveOpacityRef.current = saveOpacity;

  const applyLayer = useCallback(
    (layer: CatalogueLayer, opacity: number) => {
      const { objectName } = layer;
      if (!objectName) return;
      applyMutate({ layer: { ...layer, objectName }, opacity });
    },
    [applyMutate],
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      const applied = readCache().find((entry) => entry.id === layerId);
      if (!applied || applied.appliedId === PENDING_APPLIED_ID) return;

      cancelOpacitySave(layerId);
      removeMutate(applied);
    },
    [readCache, removeMutate, cancelOpacitySave],
  );

  const layers = useMemo(() => data ?? NO_LAYERS, [data]);

  return {
    layers,
    isPending,
    error,
    pendingIds,
    retry: refetch,
    applyLayer,
    removeLayer,
    saveOpacity,
  };
};
