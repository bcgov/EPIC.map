import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  useImportedLayers,
  useLayerUploads,
  type ImportedLayer,
  type ImportedLayerChanges,
  type ImportedLayerResponse,
} from "@/api/useImportedLayers";
import type { ImportDraft } from "@/components/Layers/UserLayers/ImportFileDialog";
import type { UploadRow } from "@/components/Layers/UserLayers/uploadUtils";
import { useImportedLayersOnMap } from "@/components/Layers/UserLayers/useImportedLayersOnMap";
import type { MapExtent } from "@/types";
import {
  DEFAULT_LAYER_OPACITY,
  FOCUS_FLY_MS,
  FOCUS_MAX_ZOOM,
  FOCUS_PADDING_PX,
} from "@/utils/config";

interface ImportedLayersContextValue {
  /** The layers map-api has stored for this user, newest first. */
  layers: readonly ImportedLayer[];
  pending: boolean;
  error: unknown;
  retry: () => void;
  /** Layers switched on: ones uploaded or zoomed to since the map opened. */
  shownIds: ReadonlySet<string>;
  /** Opacity per layer, as a percent; a layer not listed is fully opaque. */
  opacities: Readonly<Record<string, number>>;
  toggleVisible: (layerId: string) => void;
  setOpacity: (layerId: string, percent: number) => void;
  /** Fit the map to a layer, switching it on first if it was off. */
  focusLayer: (layer: ImportedLayer) => void;
  /** Layers whose features could not be fetched, so are not on the map. */
  failedIds: ReadonlySet<string>;
  retryFeatures: (layerId: string) => void;
  /** Save a layer's new name, description and sensitivity. */
  updateLayer: (
    layerId: string,
    changes: ImportedLayerChanges,
  ) => Promise<void>;
  /** Delete a layer for good, taking it off the map. */
  deleteLayer: (layerId: string) => Promise<void>;
  uploads: readonly UploadRow[];
  /** Names a new layer may not take: stored layers and ones still uploading. */
  takenNames: readonly string[];
  startUpload: (draft: ImportDraft) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  dismissUpload: (id: string) => void;
}

const ImportedLayersContext = createContext<ImportedLayersContextValue | null>(
  null,
);

/**
 * The user's imported layers, how each is shown, and the uploads adding to
 * them.
 *
 * Its own context rather than part of LayersContext: an upload reports
 * progress many times a second, and every catalogue and favourite row reads
 * LayersContext. Mounted with the map rather than the panel, so closing the
 * panel neither abandons an upload nor takes the layers off the map.
 *
 * Whether a layer is on and how opaque it is are kept for the life of the
 * map, not stored. A reload starts every layer off - each one switched on
 * fetches all its features - and a new upload arrives on.
 */
export function ImportedLayersProvider({
  map,
  children,
}: {
  map: MapLibreMap | null;
  children: ReactNode;
}) {
  const {
    layers,
    isPending,
    error,
    retry,
    addLayer,
    updateLayer,
    deleteLayer: deleteStoredLayer,
  } = useImportedLayers();

  const [shownIds, setShownIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [opacities, setOpacities] = useState<Readonly<Record<string, number>>>(
    {},
  );

  const fitTo = useCallback(
    (extent: MapExtent | null) => {
      if (!map || !extent) return;
      map.fitBounds(extent, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
        duration: FOCUS_FLY_MS,
      });
    },
    [map],
  );

  const show = useCallback((layerId: string) => {
    setShownIds((current) =>
      current.has(layerId) ? current : new Set(current).add(layerId),
    );
  }, []);

  const onUploaded = useCallback(
    (row: ImportedLayerResponse) => {
      addLayer(row);
      show(row.id);
      // Arrives switched on, and in view - the user has just asked for it.
      fitTo(row.extent);
    },
    [addLayer, show, fitTo],
  );

  const { uploads, startUpload, cancelUpload, retryUpload, dismissUpload } =
    useLayerUploads(onUploaded);

  const { failedIds, retryFeatures } = useImportedLayersOnMap(
    map,
    layers,
    shownIds,
    opacities,
  );

  const toggleVisible = useCallback((layerId: string) => {
    setShownIds((current) => {
      const next = new Set(current);
      if (!next.delete(layerId)) next.add(layerId);
      return next;
    });
  }, []);

  const setOpacity = useCallback((layerId: string, percent: number) => {
    setOpacities((current) => ({ ...current, [layerId]: percent }));
  }, []);

  const focusLayer = useCallback(
    (layer: ImportedLayer) => {
      show(layer.id);
      fitTo(layer.extent);
    },
    [show, fitTo],
  );

  // Off the map follows from leaving `layers`; what the map kept for it goes too.
  const deleteLayer = useCallback(
    async (layerId: string) => {
      await deleteStoredLayer(layerId);
      setShownIds((current) => {
        if (!current.has(layerId)) return current;
        const next = new Set(current);
        next.delete(layerId);
        return next;
      });
      setOpacities((current) => {
        if (!(layerId in current)) return current;
        const next = { ...current };
        delete next[layerId];
        return next;
      });
    },
    [deleteStoredLayer],
  );

  const takenNames = useMemo(
    () => [
      ...layers.map((layer) => layer.name),
      ...uploads.map((upload) => upload.layerName),
    ],
    [layers, uploads],
  );

  const value = useMemo(
    () => ({
      layers,
      pending: isPending,
      error,
      retry: () => void retry(),
      shownIds,
      opacities,
      toggleVisible,
      setOpacity,
      focusLayer,
      failedIds,
      retryFeatures,
      updateLayer,
      deleteLayer,
      uploads,
      takenNames,
      startUpload,
      cancelUpload,
      retryUpload,
      dismissUpload,
    }),
    [
      layers,
      isPending,
      error,
      retry,
      shownIds,
      opacities,
      toggleVisible,
      setOpacity,
      focusLayer,
      failedIds,
      retryFeatures,
      updateLayer,
      deleteLayer,
      uploads,
      takenNames,
      startUpload,
      cancelUpload,
      retryUpload,
      dismissUpload,
    ],
  );

  return (
    <ImportedLayersContext.Provider value={value}>
      {children}
    </ImportedLayersContext.Provider>
  );
}

export const useImportedLayersContext = (): ImportedLayersContextValue => {
  const value = useContext(ImportedLayersContext);
  if (!value) {
    throw new Error(
      "useImportedLayersContext must be used inside an ImportedLayersProvider",
    );
  }
  return value;
};

/** A layer's opacity as the slider shows it. */
export const opacityOf = (
  opacities: Readonly<Record<string, number>>,
  layerId: string,
): number => opacities[layerId] ?? DEFAULT_LAYER_OPACITY;
