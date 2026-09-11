import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import {
  hideWmsLayer,
  setWmsLayerOpacity,
  showWmsLayer,
} from "@/components/Layers/wmsLayers";
import { DEFAULT_LAYER_OPACITY } from "@/utils/config";

interface LayersContextValue {
  map: MapLibreMap | null;
  visibleIds: ReadonlySet<string>;
  favourites: readonly CatalogueLayer[];
  expandedId: string | null;
  opacities: Readonly<Record<string, number>>;
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
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [favourites, setFavourites] = useState<readonly CatalogueLayer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [opacities, setOpacities] = useState<Readonly<Record<string, number>>>(
    {},
  );

  const opacitiesRef = useRef(opacities);
  opacitiesRef.current = opacities;

  const toggleVisible = useCallback(
    (layer: CatalogueLayer) => {
      setVisibleIds((current) => {
        const next = new Set(current);
        if (next.delete(layer.id)) {
          if (map) hideWmsLayer(map, layer.id);
        } else {
          next.add(layer.id);
          if (map) {
            const opacity =
              opacitiesRef.current[layer.id] ?? DEFAULT_LAYER_OPACITY;
            showWmsLayer(map, layer, opacity);
          }
        }
        return next;
      });
    },
    [map],
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
      setOpacities((current) => ({ ...current, [layerId]: percent }));
      // Painted straight away rather than through an effect, so the map keeps
      // pace with the thumb instead of trailing a render behind it.
      if (map) setWmsLayerOpacity(map, layerId, percent);
    },
    [map],
  );

  const toggleExpanded = useCallback((layerId: string) => {
    setExpandedId((current) => (current === layerId ? null : layerId));
  }, []);

  const value = useMemo(
    () => ({
      map,
      visibleIds,
      favourites,
      expandedId,
      opacities,
      toggleVisible,
      toggleFavourite,
      toggleExpanded,
      setOpacity,
    }),
    [
      map,
      visibleIds,
      favourites,
      expandedId,
      opacities,
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
