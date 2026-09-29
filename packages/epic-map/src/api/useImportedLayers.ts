import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios, { type AxiosInstance } from "axios";
import type { FeatureCollection } from "geojson";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportDraft } from "@/components/Layers/UserLayers/ImportFileDialog";
import {
  buildImportForm,
  describeUploadFailure,
  gzip,
  toFeatureLines,
  type UploadRow,
} from "@/components/Layers/UserLayers/uploadUtils";
import type { MapExtent } from "@/types";
import { UPLOAD_STALL_AFTER_MS } from "@/utils/config";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

export const IMPORTED_LAYERS_PATH = "/users/me/imported-layers";

const IMPORTED_LAYERS_KEY = epicMapQueryKey("users", "me", "imported-layers");

/** Where a layer's features are cached once fetched; they never change after upload. */
export const importedFeaturesKey = (layerId: string) =>
  epicMapQueryKey("users", "me", "imported-layers", layerId, "features");

/** One fetch per layer, shared by the map and the edit preview. */
export const importedFeaturesQuery = (api: AxiosInstance, layerId: string) => ({
  queryKey: importedFeaturesKey(layerId),
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const response = await api.get<FeatureCollection>(
      `${IMPORTED_LAYERS_PATH}/${layerId}/features`,
      { signal },
    );
    return response.data;
  },
  staleTime: Infinity,
  retry: false,
});

/** A layer's features, or nothing while `layerId` is null. */
export const useImportedFeatures = (layerId: string | null) => {
  const { api } = useMapWidget();
  return useQuery({
    ...importedFeaturesQuery(api, layerId ?? ""),
    enabled: layerId !== null,
  });
};

export interface ImportedLayerResponse {
  id: string;
  name: string;
  description: string | null;
  is_sensitive: boolean;
  source_format: string;
  source_filename: string;
  source_crs: string | null;
  geometry_type: string;
  feature_count: number;
  extent: MapExtent | null;
  created_date: string;
}

export interface ImportedLayer {
  id: string;
  name: string;
  description: string | null;
  isSensitive: boolean;
  sourceFormat: string;
  sourceFilename: string;
  geometryType: string;
  featureCount: number;
  extent: MapExtent | null;
  uploadedAt: string;
}

/** What the user may change about a layer once it is stored. */
export type ImportedLayerChanges = Pick<
  ImportedLayer,
  "name" | "description" | "isSensitive"
>;

export const toImportedLayer = (row: ImportedLayerResponse): ImportedLayer => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isSensitive: row.is_sensitive,
  sourceFormat: row.source_format,
  sourceFilename: row.source_filename,
  geometryType: row.geometry_type,
  featureCount: row.feature_count,
  extent: row.extent,
  uploadedAt: /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(row.created_date)
    ? row.created_date
    : `${row.created_date}Z`,
});

export const formatUploadedDate = (uploadedAt: string): string => {
  const date = new Date(uploadedAt);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
};

const NO_LAYERS: readonly ImportedLayer[] = [];

/** The layers the signed-in user has imported, newest first. */
export const useImportedLayers = () => {
  const { api } = useMapWidget();
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: IMPORTED_LAYERS_KEY,
    queryFn: async ({ signal }) => {
      const response = await api.get<ImportedLayerResponse[]>(
        IMPORTED_LAYERS_PATH,
        { signal },
      );
      return response.data.map(toImportedLayer);
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  /** Put a layer map-api has just stored at the top, without a refetch. */
  const addLayer = useCallback(
    (row: ImportedLayerResponse) => {
      const layer = toImportedLayer(row);
      queryClient.setQueryData<ImportedLayer[]>(IMPORTED_LAYERS_KEY, (current) =>
        current?.some((entry) => entry.id === layer.id)
          ? current
          : [layer, ...(current ?? [])],
      );
    },
    [queryClient],
  );

  /**
   * Save a layer's new details and show them in place. Rejects with map-api's
   * error, so the form that asked can say what went wrong.
   */
  const updateLayer = useCallback(
    async (layerId: string, changes: ImportedLayerChanges) => {
      const response = await api.patch<ImportedLayerResponse>(
        `${IMPORTED_LAYERS_PATH}/${layerId}`,
        {
          name: changes.name,
          description: changes.description,
          is_sensitive: changes.isSensitive,
        },
      );
      const layer = toImportedLayer(response.data);
      queryClient.setQueryData<ImportedLayer[]>(IMPORTED_LAYERS_KEY, (current) =>
        current?.map((entry) => (entry.id === layer.id ? layer : entry)),
      );
    },
    [api, queryClient],
  );

  /**
   * Delete a layer and its features for good, then drop it and its cached
   * features here. Rejects with map-api's error, leaving the layer listed.
   */
  const deleteLayer = useCallback(
    async (layerId: string) => {
      await api.delete(`${IMPORTED_LAYERS_PATH}/${layerId}`);
      queryClient.setQueryData<ImportedLayer[]>(IMPORTED_LAYERS_KEY, (current) =>
        current?.filter((entry) => entry.id !== layerId),
      );
      queryClient.removeQueries({ queryKey: importedFeaturesKey(layerId) });
    },
    [api, queryClient],
  );

  const layers = useMemo(() => data ?? NO_LAYERS, [data]);

  return {
    layers,
    isPending,
    error,
    retry: refetch,
    addLayer,
    updateLayer,
    deleteLayer,
  };
};

/** What an upload holds between attempts, so Try Again repeats the same one. */
interface UploadJob {
  draft: ImportDraft;
  /** Compressed once, on the first attempt. */
  features: Blob | null;
  controller: AbortController | null;
  /** Every byte has gone; only map-api's answer is outstanding. */
  sent: boolean;
  cancelled: boolean;
  stallTimer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Imports in progress, one row each.
 *
 * Lives beside the imported layers rather than in the panel, so closing the
 * panel does not abandon an upload. Each upload's id is the layer's: a retry
 * after a dropped connection is answered with the layer the first attempt may
 * already have stored.
 */
export const useLayerUploads = (
  onUploaded: (row: ImportedLayerResponse) => void,
) => {
  const { api } = useMapWidget();
  const [uploads, setUploads] = useState<readonly UploadRow[]>([]);
  const jobs = useRef(new Map<string, UploadJob>());

  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;

  const patch = useCallback((id: string, changes: Partial<UploadRow>) => {
    setUploads((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
  }, []);

  const drop = useCallback((id: string) => {
    const job = jobs.current.get(id);
    if (job) clearTimeout(job.stallTimer);
    jobs.current.delete(id);
    setUploads((current) => current.filter((row) => row.id !== id));
  }, []);

  const run = useCallback(
    async (id: string) => {
      const job = jobs.current.get(id);
      if (!job) return;
      job.sent = false;

      const url = `${IMPORTED_LAYERS_PATH}/${id}`;

      try {
        if (!job.features) {
          patch(id, { status: "preparing", error: null, loaded: 0 });
          job.features = await gzip(toFeatureLines(job.draft.parsed.geojson));
        }
      } catch (error) {
        if (!job.cancelled) patch(id, { status: "failed", ...describeUploadFailure(error) });
        return;
      }
      if (job.cancelled) return;

      const body = buildImportForm(job.draft, job.features);
      patch(id, {
        status: "uploading",
        error: null,
        loaded: 0,
        total: job.features.size,
      });

      const armStallTimer = () => {
        clearTimeout(job.stallTimer);
        job.stallTimer = setTimeout(() => {
          if (!job.sent && !job.cancelled) patch(id, { status: "stalled" });
        }, UPLOAD_STALL_AFTER_MS);
      };

      const controller = new AbortController();
      job.controller = controller;
      armStallTimer();

      try {
        const response = await api.put<ImportedLayerResponse>(url, body, {
          signal: controller.signal,
          onUploadProgress: ({ loaded, total }) => {
            if (job.cancelled) return;
            // Without a total there is no telling the last byte from any other,
            // so the row stays on "Uploading…" until map-api answers.
            if (total !== undefined && loaded >= total) {
              job.sent = true;
              clearTimeout(job.stallTimer);
              patch(id, { status: "processing", loaded: total, total });
            } else {
              armStallTimer();
              patch(id, {
                status: "uploading",
                loaded,
                total: total ?? job.features?.size ?? loaded,
              });
            }
          },
        });
        clearTimeout(job.stallTimer);
        if (job.cancelled) {
          // Cancelled after the last byte left, so map-api stored it anyway.
          void api.delete(url).catch(() => undefined);
          return;
        }
        drop(id);
        uploaded.current(response.data);
      } catch (error) {
        clearTimeout(job.stallTimer);
        if (job.cancelled || axios.isCancel(error)) return;
        patch(id, { status: "failed", ...describeUploadFailure(error) });
      } finally {
        job.controller = null;
      }
    },
    [api, patch, drop],
  );

  const startUpload = useCallback(
    (draft: ImportDraft) => {
      const id = crypto.randomUUID();
      jobs.current.set(id, {
        draft,
        features: null,
        controller: null,
        sent: false,
        cancelled: false,
        stallTimer: undefined,
      });
      setUploads((current) => [
        ...current,
        {
          id,
          fileName: draft.file.name,
          layerName: draft.name,
          status: "preparing",
          loaded: 0,
          total: 0,
          error: null,
          retryable: false,
        },
      ]);
      void run(id);
    },
    [run],
  );

  /**
   * Stop an upload and take its row away. One still sending is aborted, so
   * map-api never has the whole file; one already sent cannot be recalled, so
   * its layer is deleted as soon as map-api has finished storing it.
   */
  const cancelUpload = useCallback(
    (id: string) => {
      const job = jobs.current.get(id);
      if (job) {
        job.cancelled = true;
        if (!job.sent) job.controller?.abort();
      }
      drop(id);
    },
    [drop],
  );

  const retryUpload = useCallback(
    (id: string) => {
      const job = jobs.current.get(id);
      if (!job || job.controller) return;
      job.cancelled = false;
      void run(id);
    },
    [run],
  );

  // The browser knows before the next progress event does.
  useEffect(() => {
    const onOffline = () => {
      setUploads((current) =>
        current.map((row) =>
          row.status === "uploading" ? { ...row, status: "stalled" } : row,
        ),
      );
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  // The widget unmounting takes its uploads with it.
  useEffect(() => {
    const pending = jobs.current;
    return () => {
      for (const job of pending.values()) {
        job.cancelled = true;
        clearTimeout(job.stallTimer);
        if (!job.sent) job.controller?.abort();
      }
      pending.clear();
    };
  }, []);

  return {
    uploads,
    startUpload,
    cancelUpload,
    retryUpload,
    dismissUpload: drop,
  };
};
