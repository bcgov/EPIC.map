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
  visibleRows,
  type MetaDataRow,
  type PopupPlacement,
} from "@/components/MetaData/metaData";
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
  const { map, appliedLayers, visibleIds } = useLayers();

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

  const results = useMetaData(layers, click?.box ?? null);
  const allRows = toRows(layers, results);
  const loading = isLoading(allRows);
  const rows = loading ? [] : visibleRows(allRows);
  const selected = selectedRow(rows, chosenLayerId);

  const open = click !== null && layers.length > 0;

  useEffect(() => {
    if (click && layers.length === 0) setClick(null);
  }, [click, layers.length]);

  const highlightLayer = selected?.layer.objectName ?? null;
  const highlightFeature = selected?.feature ?? null;

  useEffect(() => {
    if (!map || !open || !highlightLayer || !highlightFeature) return undefined;
    showHighlight(map, {
      objectName: highlightLayer,
      featureId: highlightFeature.id,
      geometry: highlightFeature.geometry,
    });
    return () => hideHighlight(map);
  }, [map, open, highlightLayer, highlightFeature]);

  const zoomTo = useCallback(
    (row: MetaDataRow) => {
      const bounds = row.feature?.bounds;
      if (!map || !bounds) return;
      const camera = map.cameraForBounds(bounds, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
      });
      if (camera) map.easeTo({ ...camera, duration: FOCUS_FLY_MS });
    },
    [map],
  );

  const select = useCallback(
    (row: MetaDataRow) => {
      setChosenLayerId(row.layer.id);
      zoomTo(row);
    },
    [zoomTo],
  );

  const retry = useCallback(
    (row: MetaDataRow) => {
      const index = layers.findIndex((layer) => layer.id === row.layer.id);
      void results[index]?.refetch();
    },
    [layers, results],
  );

  const close = useCallback(() => setClick(null), []);

  if (!click || !open) return null;

  return (
    <MetaDataPopup
      key={click.key}
      placement={click.placement}
      title={popupTitle(loading, rows.length)}
      loading={loading}
      rows={rows}
      selected={selected}
      onSelect={select}
      onRetry={retry}
      onZoom={zoomTo}
      onClose={close}
    />
  );
}
