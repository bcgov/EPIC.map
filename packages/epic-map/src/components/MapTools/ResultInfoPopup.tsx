import { useMemo } from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useQueryClient } from "@tanstack/react-query";
import { importedFeaturesKey } from "@/api/useImportedLayers";
import {
  localFeatureRef,
  useLocalLayerFeatures,
  type LocalFeatureRef,
} from "@/api/useLocalLayerFeatures";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import MetaDataPopup from "@/components/MetaData/MetaDataPopup";
import { localRows } from "@/components/MetaData/localRows";
import {
  attributeLabel,
  clampToContainer,
  importedRows,
  popupTitle,
  POPUP_MARGIN_PX,
  selectedOption,
  type MetaDataRow,
} from "@/components/MetaData/metaDataUtils";

const POPUP_WIDTH_PX = 320;

const noop = () => {};

/** The identify popup for one What's here result. */
export default function ResultInfoPopup({ map }: { map: MapLibreMap | null }) {
  const { info, results, hideInfo } = useSelectArea();
  const queryClient = useQueryClient();

  const group = results?.find(({ key }) => key === info?.groupKey);
  const feature = group?.features.find(({ key }) => key === info?.featureKey);

  const localRefs = useMemo<LocalFeatureRef[]>(
    () =>
      group?.kind === "hosted" && group.objectName && feature
        ? [{ objectName: group.objectName, key: feature.key }]
        : [],
    [group, feature],
  );
  const localDetails = useLocalLayerFeatures(localRefs);

  if (!map || !info || !group || !feature) return null;

  const layer = { id: group.layerId, name: group.name, objectName: group.objectName };
  let rows: MetaDataRow[] = [];
  if (group.kind === "catalogue") {
    rows = [
      {
        layer,
        status: "found",
        retrying: false,
        features: [
          {
            key: feature.key,
            name: feature.name,
            records: [
              {
                id: "0",
                attributes: feature.properties.map(({ name, value }) => ({
                  label: attributeLabel(name),
                  value,
                })),
              },
            ],
            id: feature.id,
            geometry: null,
            bounds: null,
          },
        ],
      },
    ];
  } else if (group.kind === "hosted" && group.objectName) {
    rows = localRows(
      layer,
      group.objectName,
      [{ key: feature.key, name: feature.name }],
      localDetails,
    );
  } else if (group.kind === "imported") {
    rows = importedRows(
      [{ layerId: group.layerId, featureId: feature.key }],
      [layer],
      (layerId, featureId) =>
        queryClient
          .getQueryData<FeatureCollection>(importedFeaturesKey(layerId))
          ?.features.find(({ id }) => String(id) === String(featureId)) ?? null,
    );
  }

  const container = map.getContainer();
  const width = Math.max(
    0,
    Math.min(POPUP_WIDTH_PX, container.clientWidth - 2 * POPUP_MARGIN_PX),
  );

  return (
    <MetaDataPopup
      key={`${info.groupKey}::${info.featureKey}`}
      placement={{
        left: clampToContainer(info.right - POPUP_MARGIN_PX - width, width, container.clientWidth),
        top: Math.max(POPUP_MARGIN_PX, info.top),
        width,
      }}
      title={popupTitle(false, 1)}
      loading={false}
      rows={rows}
      selected={selectedOption(rows, null)}
      canZoom={false}
      onSelect={noop}
      onRetry={() =>
        group.objectName &&
        localDetails[localFeatureRef(group.objectName, feature.key)]?.retry()
      }
      onZoom={noop}
      onClose={hideInfo}
    />
  );
}
