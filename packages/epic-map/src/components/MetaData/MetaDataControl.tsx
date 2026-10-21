import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { useQueryClient } from "@tanstack/react-query";
import type { AppliedLayer } from "@/api/useAppliedLayers";
import { importedFeaturesKey } from "@/api/useImportedLayers";
import {
  localFeatureRef,
  useLocalLayerFeatures,
  type LocalFeatureRef,
} from "@/api/useLocalLayerFeatures";
import { useMetaData } from "@/api/useMetaData";
import MetaDataPopup from "@/components/MetaData/MetaDataPopup";
import { localRows, type LocalHit } from "@/components/MetaData/localRows";
import {
  boundsOutOfView,
  clickBox,
  featureCount,
  importedRows,
  isEmptySoFar,
  isLoading,
  popupPlacement,
  popupTitle,
  selectedOption,
  toRows,
  useFeatureOutOfView,
  visibleRows,
  type ImportedHit,
  type MetaDataOption,
  type MetaDataRow,
  type MetaDataSelection,
  type PopupPlacement,
} from "@/components/MetaData/metaDataUtils";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  hideHighlight,
  importedLayerIdOf,
  importedStyleLayerIds,
  localDrawnIds,
  showHighlight,
  showLocalHighlight,
} from "@/components/Layers/layerUtils";
import { useImportedLayersContext } from "@/components/Layers/UserLayers/ImportedLayersContext";
import { projectIdAt } from "@/components/Projects/projectUtils";
import type { MapExtent } from "@/types";
import {
  FOCUS_FLY_MS,
  FOCUS_MAX_ZOOM,
  FOCUS_PADDING_PX,
  METADATA_TOLERANCE_PX,
} from "@/utils/config";
import {
  EAO_OBJECT_NAME,
  HOSTED_LAYERS,
  localLayerId,
  type HostedLayerSpec,
} from "@/utils/localLayers";

const POPUP_WIDTH_PX = 320;

/** One hosted layer's features under a click, with what is needed to draw them. */
interface LocalClick {
  spec: HostedLayerSpec;
  /** The layer as the popup lists it, which is its row in Favourites. */
  layerId: string;
  layerName: string;
  /** The layer's name inside the vector tile, for the highlight's filter. */
  sourceLayer: string;
  hits: LocalHit[];
}

interface MetaDataClick {
  /** Remounts the popup per click, so a drag or scroll does not carry over. */
  key: number;
  box: MapExtent;
  placement: PopupPlacement;
  /** The layers switched on at the moment of the click, top of the stack first. */
  layers: AppliedLayer[];
  /** Imported features under the click, answered on the spot. */
  imported: MetaDataRow[];
  /** Hosted features under the click, whose records are then asked for. */
  local: LocalClick[];
}

/**
 * Click the map, see what the enabled layers have there: catalogue layers by
 * asking map-api, imported and hosted layers from the features already drawn.
 */
export default function MetaDataControl() {
  const {
    map,
    appliedLayers,
    favourites,
    visibleIds,
    belowFloorIds,
    beyondReachIds,
    layerFloors,
  } = useLayers();

  const { layers: importedLayers, shownIds: importedShownIds } =
    useImportedLayersContext();
  const queryClient = useQueryClient();

  const [click, setClick] = useState<MetaDataClick | null>(null);
  const [chosen, setChosen] = useState<MetaDataSelection | null>(null);

  const appliedRef = useRef(appliedLayers);
  appliedRef.current = appliedLayers;

  const importedRef = useRef({ importedLayers, importedShownIds });
  importedRef.current = { importedLayers, importedShownIds };

  /** The hosted layers on the map, named as their favourite row names them. */
  const hostedShown = useMemo(
    () =>
      HOSTED_LAYERS.filter(
        // EAO footprints answer a click by opening their project, which
        // ProjectsControl does. Identifying them as a layer as well would put
        // a popup beside the card. Lift this when the components are drawn and
        // localRows can describe them.
        (spec) => spec.objectName !== EAO_OBJECT_NAME,
      ).map((spec) => {
        const id = localLayerId(spec.objectName);
        const favourite = favourites.find((entry) => entry.id === id);
        return { spec, layerId: id, layerName: favourite?.name ?? "" };
      }).filter(({ layerId, layerName }) => layerName && visibleIds.has(layerId)),
    [favourites, visibleIds],
  );

  const hostedRef = useRef(hostedShown);
  hostedRef.current = hostedShown;

  // Counts up for the life of the widget, never per map instance
  const clicks = useRef(0);

  useEffect(() => {
    if (!map) return undefined;

    const onClick = (event: MapMouseEvent) => {
      // A project dot opens its own card instead of a popup beside it: a
      // small, deliberate target with nothing of its own to identify.
      //
      // Its footprint opens the card as well, but covers whole regions, so it
      // does not take the click from the layers underneath - suppressing those
      // too made every boundary a dead zone for identify. The prototype draws
      // the same line: selecting a project and identifying a data layer are
      // separate answers to one click.
      if (projectIdAt(map, event.point) !== null) {
        setClick(null);
        return;
      }

      const layers = appliedRef.current
        .filter((layer) => layer.objectName)
        .reverse();

      const { x, y } = event.point;
      const t = METADATA_TOLERANCE_PX;
      const box: [[number, number], [number, number]] = [
        [x - t, y - t],
        [x + t, y + t],
      ];

      const { importedLayers: stored, importedShownIds: shown } =
        importedRef.current;
      const shownImported = stored.filter((layer) => shown.has(layer.id));
      const styleLayers = shownImported
        .flatMap((layer) => importedStyleLayerIds(layer.id))
        .filter((id) => map.getLayer(id));
      const hits: ImportedHit[] = styleLayers.length
        ? map
            .queryRenderedFeatures(box, { layers: styleLayers })
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

      /*
      Hosted layers are asked of the map rather than of map-api: their tiles are
      already in the browser, and the same click can land on several overlapping
      areas, which is what the popup lists. A shape crossing a tile seam comes
      back once per tile, so the key folds those back into one feature.
      */
      const local: LocalClick[] = hostedRef.current.flatMap(
        ({ spec, layerId, layerName }) => {
          const drawn = localDrawnIds(map, layerId);
          if (drawn.length === 0) return [];

          const seen = new Map<string, LocalHit>();
          let sourceLayer = "";
          for (const rendered of map.queryRenderedFeatures(box, {
            layers: drawn,
          })) {
            const key = rendered.properties?.[spec.keyProperty];
            if (typeof key !== "string" || seen.has(key)) continue;
            sourceLayer = rendered.sourceLayer ?? sourceLayer;
            seen.set(key, {
              key,
              name:
                String(rendered.properties?.[spec.nameProperty] ?? "").trim() ||
                layerName,
            });
          }

          if (seen.size === 0) return [];
          return [
            { spec, layerId, layerName, sourceLayer, hits: [...seen.values()] },
          ];
        },
      );

      if (layers.length === 0 && imported.length === 0 && local.length === 0) {
        setClick(null);
        return;
      }

      const container = map.getContainer();
      clicks.current += 1;
      setChosen(null);
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
        local,
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

  const shownLocal = useMemo(
    () => click?.local.filter((entry) => visibleIds.has(entry.layerId)) ?? [],
    [click, visibleIds],
  );

  const nothingShown =
    shown.length === 0 && shownImported.length === 0 && shownLocal.length === 0;

  const { byLayer, isError, retrying, retry } = useMetaData(
    click?.layers ?? [],
    click?.box ?? null,
    click?.key ?? 0,
  );

  const localRefs = useMemo<LocalFeatureRef[]>(
    () =>
      shownLocal.flatMap((entry) =>
        entry.hits.map((hit) => ({
          objectName: entry.spec.objectName,
          key: hit.key,
        })),
      ),
    [shownLocal],
  );
  const localDetails = useLocalLayerFeatures(localRefs);

  // Imported and hosted layers draw above the catalogue's, so their rows lead.
  const allRows = [
    ...shownImported,
    ...shownLocal.flatMap((entry) =>
      localRows(
        {
          id: entry.layerId,
          name: entry.layerName,
          objectName: entry.spec.objectName,
        },
        entry.spec.objectName,
        entry.hits,
        localDetails,
      ),
    ),
    ...toRows(shown, byLayer, { failed: isError, retrying }),
  ];

  // The list fills as layers answer rather than all at once: a warehouse layer
  // taking its time should not hold back the ones already here.
  const loading = isLoading(allRows);
  const rows = isEmptySoFar(allRows) ? [] : visibleRows(allRows);
  const selected = selectedOption(rows, chosen);

  useEffect(() => {
    if (click && nothingShown) setClick(null);
  }, [click, nothingShown]);

  const selectedLayerId = selected?.row.layer.id ?? null;
  const selectedObjectName = selected?.row.layer.objectName ?? null;
  const selectedFeature = selected?.feature ?? null;
  const localHighlight = shownLocal.find(
    (entry) => entry.layerId === selectedLayerId,
  );
  const localSourceLayer = localHighlight?.sourceLayer ?? null;
  const localKeyProperty = localHighlight?.spec.keyProperty ?? null;

  useEffect(() => {
    if (!map || !selectedFeature) return undefined;

    // A hosted feature is drawn from its own tiles, which hold all of it; the
    // copy a query hands back is clipped to the tile the click was in.
    if (localSourceLayer && localKeyProperty && selectedLayerId) {
      showLocalHighlight(map, {
        layerId: selectedLayerId,
        sourceLayer: localSourceLayer,
        keyProperty: localKeyProperty,
        key: selectedFeature.key,
      });
      return () => hideHighlight(map);
    }

    showHighlight(map, {
      objectName: selectedObjectName,
      featureId: selectedFeature.id,
      geometry: selectedFeature.geometry,
    });
    return () => hideHighlight(map);
  }, [
    map,
    selectedLayerId,
    selectedObjectName,
    selectedFeature,
    localSourceLayer,
    localKeyProperty,
  ]);

  const zoomTo = useCallback(
    (option: MetaDataOption) => {
      const bounds = option.feature.bounds;
      if (!map || !bounds) return;
      const camera = map.cameraForBounds(bounds, {
        padding: FOCUS_PADDING_PX,
        maxZoom: FOCUS_MAX_ZOOM,
      });
      if (!camera) return;

      // Far enough in for the layer's own raster to draw, not just the feature
      // to fill the screen: a big feature frames at a zoom its layer is still
      // blank at, which would land the user on an outline and nothing else.
      const floor = layerFloors[option.row.layer.id] ?? 0;
      map.easeTo({
        ...camera,
        zoom: Math.max(camera.zoom ?? floor, floor),
        duration: FOCUS_FLY_MS,
      });
    },
    [map, layerFloors],
  );

  /**
   * Selecting moves the camera only when the feature cannot be seen from here.
   *
   * Stepping through five overlapping areas should not throw the map about -
   * the point the user clicked is what they are reading from. A feature that is
   * off screen or a speck at this zoom is the opposite case: selecting it would
   * otherwise highlight something invisible.
   */
  const select = useCallback(
    (option: MetaDataOption) => {
      setChosen({
        layerId: option.row.layer.id,
        featureKey: option.feature.key,
      });
      if (boundsOutOfView(map, option.feature.bounds)) zoomTo(option);
    },
    [map, zoomTo],
  );

  /**
   * Ask again for whatever the selected row is missing.
   *
   * Two different failures behind one button: a warehouse layer that did not
   * answer the click at all, and a hosted feature whose records did not load.
   * The row knows which it is, so the popup does not have to.
   */
  const retryOption = useCallback(
    (option: MetaDataOption) => {
      const { objectName } = option.row.layer;
      if (!objectName) return;
      if (option.row.status === "error") {
        retry(objectName);
        return;
      }
      localDetails[localFeatureRef(objectName, option.feature.key)]?.retry();
    },
    [retry, localDetails],
  );

  const close = useCallback(() => setClick(null), []);

  const outOfView = useFeatureOutOfView(map, selected?.feature.bounds ?? null);

  /*
  Worth offering when the feature cannot be seen from here: either its layer
  draws nothing at this zoom, or the feature itself is off screen or too small
  to make out. A layer whose floor is past anything this map can reach is left
  out - zooming there would not show it either.
  */
  const canZoom =
    Boolean(selected?.feature.bounds) &&
    !beyondReachIds.has(selectedLayerId ?? "") &&
    (belowFloorIds.has(selectedLayerId ?? "") || outOfView);

  if (!click || nothingShown) return null;

  return (
    <MetaDataPopup
      key={click.key}
      placement={click.placement}
      title={popupTitle(loading, featureCount(rows))}
      loading={loading}
      rows={rows}
      selected={selected}
      canZoom={canZoom}
      onSelect={select}
      onRetry={retryOption}
      onZoom={zoomTo}
      onClose={close}
    />
  );
}
