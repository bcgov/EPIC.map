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
  favourites: readonly CatalogueLayer[];
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

  const [favourites, setFavourites] = useState<readonly CatalogueLayer[]>([]);
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

  const toggleFavourite = useCallback((layer: CatalogueLayer) => {
    setFavourites((current) =>
      current.some((favourite) => favourite.id === layer.id)
        ? current.filter((favourite) => favourite.id !== layer.id)
        : [...current, layer],
    );
  }, []);

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
