import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import { useMetaData } from "@/api/useMetaData";
import MetaDataPopup from "@/components/MetaData/MetaDataPopup";
import {
  clickBox,
  isLoading,
  popupPlacement,
  popupTitle,
  selectedRow,
  toRows,
  useFeatureOutOfView,
  visibleRows,
  type MetaDataRow,
  type PopupPlacement,
} from "@/components/MetaData/metaDataUtils";
import { useLayers } from "@/components/Layers/LayersContext";
import { hideHighlight, showHighlight } from "@/components/Layers/layerUtils";
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
}

/**
 * Click the map, see what the enabled catalogue layers have there.
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

  const [click, setClick] = useState<MetaDataClick | null>(null);
  const [chosenLayerId, setChosenLayerId] = useState<string | null>(null);

  const appliedRef = useRef(appliedLayers);
  appliedRef.current = appliedLayers;

  useEffect(() => {
    if (!map) return undefined;

    let clicks = 0;
    const onClick = (event: MapMouseEvent) => {
      const layers = appliedRef.current
        .filter((layer) => layer.objectName)
        .reverse();

      if (layers.length === 0) {
        setClick(null);
        return;
      }

      const container = map.getContainer();
      clicks += 1;
      setChosenLayerId(null);
      setClick({
        key: clicks,
        box: clickBox(map, event.point, METADATA_TOLERANCE_PX),
        placement: popupPlacement(
          event.point,
          { width: container.clientWidth, height: container.clientHeight },
          POPUP_WIDTH_PX,
        ),
        layers,
      });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  // A layer switched off after the click drops out of the popup with it.
  const layers = useMemo(
    () => click?.layers.filter((layer) => visibleIds.has(layer.id)) ?? [],
    [click, visibleIds],
  );

  const { byLayer, isError, retrying, retry } = useMetaData(
    layers,
    click?.box ?? null,
    click?.key ?? 0,
  );
  const allRows = toRows(layers, byLayer, { failed: isError, retrying });
  const loading = isLoading(allRows);
  const rows = loading ? [] : visibleRows(allRows);
  const selected = selectedRow(rows, chosenLayerId);

  useEffect(() => {
    if (click && layers.length === 0) setClick(null);
  }, [click, layers.length]);

  const highlightLayer = selected?.layer.objectName ?? null;
  const highlightFeature = selected?.feature ?? null;

  useEffect(() => {
    if (!map || !highlightLayer || !highlightFeature) return undefined;
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

  if (!click || layers.length === 0) return null;

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
