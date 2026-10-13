import { useCallback, useEffect, useRef } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { FOCUS_FLY_MS } from "@/utils/config";

/**
 * The marker dropped on whatever the user picked out of the search, and the
 * camera move to it.
 *
 * One marker, moved rather than accumulated: the field answers one question at a
 * time, and a map that collects a pin per search becomes a record of what the
 * user typed instead of where they are.
 *
 * A `Marker` rather than a source and layer of our own, which is how every other
 * drawn thing in this widget works. The difference is that a marker is a DOM
 * element positioned over the canvas rather than part of the style, so switching
 * basemaps leaves it alone — `carryWidgetLayers` in MapSurface exists precisely
 * because style members do not survive that, and this has nothing to carry.
 *
 * Drawn in the host theme's primary, rather than in the gold a selected feature
 * is highlighted in. A search result is not a feature of any layer - it is a
 * location the user named - so colouring it like one would say the map had found
 * something in the data that it has not.
 */
export const useSearchMarker = (
  map: MapLibreMap | null,
  /** The marker's fill, from the host's theme. */
  color: string,
) => {
  const marker = useRef<Marker | null>(null);

  // The map is torn down on unmount and remade on remount, so a marker left
  // attached to the old instance would be holding a detached canvas.
  useEffect(
    () => () => {
      marker.current?.remove();
      marker.current = null;
    },
    [map],
  );

  const showAt = useCallback(
    (coordinates: [number, number], zoom: number) => {
      if (!map) return;

      if (marker.current) {
        marker.current.setLngLat(coordinates);
      } else {
        marker.current = new Marker({ color })
          .setLngLat(coordinates)
          .addTo(map);
      }

      map.flyTo({ center: coordinates, zoom, duration: FOCUS_FLY_MS });
    },
    [map, color],
  );

  const clear = useCallback(() => {
    marker.current?.remove();
    marker.current = null;
  }, []);

  return { showAt, clear };
};
