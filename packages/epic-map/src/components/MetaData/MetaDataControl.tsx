import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { useQueryClient } from "@tanstack/react-query";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import { importedFeaturesKey } from "@/api/useImportedLayers";
import { useMetaData } from "@/api/useMetaData";
import MetaDataPopup from "@/components/MetaData/MetaDataPopup";
import {
  clickBox,
  importedRows,
  isLoading,
  popupPlacement,
  popupTitle,
  selectedRow,
  toRows,
  useFeatureOutOfView,
  visibleRows,
  type ImportedHit,
  type MetaDataRow,
  type PopupPlacement,
} from "@/components/MetaData/metaDataUtils";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  hideHighlight,
  importedLayerIdOf,
  importedStyleLayerIds,
  showHighlight,
} from "@/components/Layers/layerUtils";
import { useImportedLayersContext } from "@/components/Layers/UserLayers/ImportedLayersContext";
import type { MapExtent } from "@/types";
import {
  FOCUS_FLY_MS,
  FOCUS_MAX_ZOOM,
  FOCUS_PADDING_PX,
  METADATA_TOLERANCE_PX,
} from "@/utils/config";

const POPUP_WIDTH_PX = 320;

interface MetaDataClick {
  /** Remounts the popup per click, so a drag or scroll does not carry over. */
  key: number;
  box: MapExtent;
  placement: PopupPlacement;
  /** The layers switched on at the moment of the click, top of the stack first. */
  layers: AppliedLayer[];
  /** Imported features under the click, answered on the spot. */
  imported: MetaDataRow[];
}

/**
 * Click the map, see what the enabled layers have there: catalogue layers by
 * asking map-api, imported layers from the features already on the map.
 */
export default function MetaDataControl() {
  const {
    map,
    appliedLayers,
    visibleIds,
    belowFloorIds,
    beyondReachIds,
    layerFloors,
  } = useLayers();

  const { layers: importedLayers, shownIds: importedShownIds } =
    useImportedLayersContext();
  const queryClient = useQueryClient();

  const [click, setClick] = useState<MetaDataClick | null>(null);
  const [chosenLayerId, setChosenLayerId] = useState<string | null>(null);

  const appliedRef = useRef(appliedLayers);
  appliedRef.current = appliedLayers;

  const importedRef = useRef({ importedLayers, importedShownIds });
  importedRef.current = { importedLayers, importedShownIds };

  // Counts up for the life of the widget, never per map instance
  const clicks = useRef(0);

  useEffect(() => {
    if (!map) return undefined;

    const onClick = (event: MapMouseEvent) => {
      const layers = appliedRef.current
        .filter((layer) => layer.objectName)
        .reverse();

      const { importedLayers: stored, importedShownIds: shown } =
        importedRef.current;
      const shownImported = stored.filter((layer) => shown.has(layer.id));
      const styleLayers = shownImported
        .flatMap((layer) => importedStyleLayerIds(layer.id))
        .filter((id) => map.getLayer(id));
      const { x, y } = event.point;
      const t = METADATA_TOLERANCE_PX;
      const hits: ImportedHit[] = styleLayers.length
        ? map
            .queryRenderedFeatures(
              [
                [x - t, y - t],
                [x + t, y + t],
              ],
              { layers: styleLayers },
            )
            .flatMap((rendered) => {
              const layerId = importedLayerIdOf(rendered.layer.id);
              return layerId
                ? [
                    {
                      layerId,
                      featureId: rendered.id,
                      rendered: rendered as Feature,
                    },
                  ]
                : [];
            })
        : [];
      const findFeature = (
        layerId: string,
        featureId: ImportedHit["featureId"],
      ) =>
        queryClient
          .getQueryData<FeatureCollection>(importedFeaturesKey(layerId))
          ?.features.find((feature) => feature.id === featureId) ?? null;
      const imported = importedRows(hits, shownImported, findFeature);

      if (layers.length === 0 && imported.length === 0) {
        setClick(null);
        return;
      }

      const container = map.getContainer();
      clicks.current += 1;
      setChosenLayerId(null);
      setClick({
        key: clicks.current,
        box: clickBox(map, event.point, METADATA_TOLERANCE_PX),
        placement: popupPlacement(
          event.point,
          { width: container.clientWidth, height: container.clientHeight },
          POPUP_WIDTH_PX,
        ),
        layers,
        imported,
      });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, queryClient]);

  const shown = useMemo(
    () => click?.layers.filter((layer) => visibleIds.has(layer.id)) ?? [],
    [click, visibleIds],
  );

  // Switching an imported layer off takes its row out of an open popup, the
  // way switching off a catalogue layer does.
  const shownImported = useMemo(
    () =>
      click?.imported.filter((row) => importedShownIds.has(row.layer.id)) ?? [],
    [click, importedShownIds],
  );
  const nothingShown = shown.length === 0 && shownImported.length === 0;

  const { byLayer, isError, retrying, retry } = useMetaData(
    click?.layers ?? [],
    click?.box ?? null,
    click?.key ?? 0,
  );
  // Imported layers draw above the catalogue's, so their rows lead.
  const allRows = [
    ...shownImported,
    ...toRows(shown, byLayer, { failed: isError, retrying }),
  ];
  const loading = isLoading(allRows);
  const rows = loading ? [] : visibleRows(allRows);
  const selected = selectedRow(rows, chosenLayerId);

  useEffect(() => {
    if (click && nothingShown) setClick(null);
  }, [click, nothingShown]);

  const highlightLayer = selected?.layer.objectName ?? null;
  const highlightFeature = selected?.feature ?? null;

  useEffect(() => {
    if (!map || !highlightFeature) return undefined;
    showHighlight(map, {
      objectName: highlightLayer,
      featureId: highlightFeature.id,
      geometry: highlightFeature.geometry,
    });
    return () => hideHighlight(map);
  }, [map, highlightLayer, highlightFeature]);

  const zoomTo = useCallback(
    (row: MetaDataRow) => {
      const bounds = row.feature?.bounds;
      if (!map || !bounds) return;
      const camera = map.cameraForBounds(bounds, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
      });
      if (!camera) return;

      // Far enough in for the layer's own raster to draw, not just the feature
      // to fill the screen: a big feature frames at a zoom its layer is still
      // blank at, which would land the user on an outline and nothing else.
      const floor = layerFloors[row.layer.id] ?? 0;
      map.easeTo({
        ...camera,
        zoom: Math.max(camera.zoom ?? floor, floor),
        duration: FOCUS_FLY_MS,
      });
    },
    [map, layerFloors],
  );

  const select = useCallback(
    (row: MetaDataRow) => {
      setChosenLayerId(row.layer.id);
      zoomTo(row);
    },
    [zoomTo],
  );

  const retryRow = useCallback(
    (row: MetaDataRow) => {
      if (row.layer.objectName) retry(row.layer.objectName);
    },
    [retry],
  );

  const close = useCallback(() => setClick(null), []);

  const outOfView = useFeatureOutOfView(map, selected?.feature?.bounds ?? null);

  /*
  Worth offering when the feature cannot be seen from here: either its layer
  draws nothing at this zoom, or the feature itself is off screen or too small
  to make out. A layer whose floor is past anything this map can reach is left
  out - zooming there would not show it either.
  */
  const canZoom =
    Boolean(selected?.feature?.bounds) &&
    !beyondReachIds.has(selected?.layer.id ?? "") &&
    (belowFloorIds.has(selected?.layer.id ?? "") || outOfView);

  if (!click || nothingShown) return null;

  return (
    <MetaDataPopup
      key={click.key}
      placement={click.placement}
      title={popupTitle(loading, rows.length)}
      loading={loading}
      rows={rows}
      selected={selected}
      canZoom={canZoom}
      onSelect={select}
      onRetry={retryRow}
      onZoom={zoomTo}
      onClose={close}
    />
  );
}
