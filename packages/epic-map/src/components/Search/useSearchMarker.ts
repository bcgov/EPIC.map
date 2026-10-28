import { useCallback, useEffect, useRef } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { FOCUS_FLY_MS } from "@/utils/config";

/**
 * The camera move to whatever the user picked out of the search, and the marker
 * that stands in where the map draws nothing of its own.
 *
 * Only places are pinned. A project is already a dot carrying its type's glyph
 * and its work state's colour, so a pin beside it would be a second symbol for
 * one thing; the camera centring on it is what says which dot it is. Picking a
 * project takes down any pin an earlier place left, so the map never shows two
 * answers to one field at once.
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

  const clear = useCallback(() => {
    marker.current?.remove();
    marker.current = null;
  }, []);

  const flyTo = useCallback(
    (coordinates: [number, number], zoom: number, offset?: [number, number]) => {
      map?.flyTo({ center: coordinates, zoom, offset, duration: FOCUS_FLY_MS });
    },
    [map],
  );

  /** Go to a place, and pin it: the map shows nothing else there. */
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

      flyTo(coordinates, zoom);
    },
    [map, color, flyTo],
  );

  /**
   * Go to a project, which is already drawn, and take any pin down.
   *
   * `offset` moves where the target lands, in pixels from the container's
   * centre, for a caller that is about to cover part of the map.
   */
  const goTo = useCallback(
    (coordinates: [number, number], zoom: number, offset?: [number, number]) => {
      if (!map) return;

      clear();
      flyTo(coordinates, zoom, offset);
    },
    [map, clear, flyTo],
  );

  return { showAt, goTo, clear };
};
