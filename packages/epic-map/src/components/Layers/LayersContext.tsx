import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { hideWmsLayer, showWmsLayer } from "@/components/Layers/wmsLayers";

interface LayersContextValue {
  map: MapLibreMap | null;
  visibleIds: ReadonlySet<string>;
  favourites: readonly CatalogueLayer[];
  toggleVisible: (layer: CatalogueLayer) => void;
  toggleFavourite: (layer: CatalogueLayer) => void;
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

  const toggleVisible = useCallback(
    (layer: CatalogueLayer) => {
      setVisibleIds((current) => {
        const next = new Set(current);
        if (next.delete(layer.id)) {
          if (map) hideWmsLayer(map, layer.id);
        } else {
          next.add(layer.id);
          if (map) showWmsLayer(map, layer);
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

  const value = useMemo(
    () => ({ map, visibleIds, favourites, toggleVisible, toggleFavourite }),
    [map, visibleIds, favourites, toggleVisible, toggleFavourite],
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
