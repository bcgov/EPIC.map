import { useCallback } from "react";
import type { FeatureAttribute } from "@/api/useMetaData";
import type { MapExtent } from "@/types";
import { useMapWidget } from "@/widget/MapWidgetContext";

const WHATS_HERE_PATH = "/whats-here";

export type WhatsHereKind = "catalogue" | "hosted" | "imported";

export interface WhatsHereFeature {
  /** Null where the layer has no stable id. */
  id: string | null;
  name: string | null;
  /** Warehouse layers only. */
  properties: FeatureAttribute[];
}

export interface WhatsHereLayerResult {
  kind: WhatsHereKind;
  /** Object name, or imported layer id. */
  layer: string;
  status: "found" | "empty" | "error";
  features: WhatsHereFeature[];
  /** May exceed the features listed. */
  matched: number;
  error: string | null;
}

export interface WhatsHereRequest {
  selection: string[];
  catalogue: string[];
  hosted: string[];
  imported: string[];
}

/** The What's here search, and a warehouse feature's bounds. */
export const useWhatsHereApi = () => {
  const { api } = useMapWidget();

  const search = useCallback(
    async (request: WhatsHereRequest, signal?: AbortSignal) =>
      (
        await api.post<{ results: WhatsHereLayerResult[] }>(
          WHATS_HERE_PATH,
          request,
          { signal },
        )
      ).data.results,
    [api],
  );

  const warehouseBounds = useCallback(
    async (objectName: string, featureId: string) =>
      (
        await api.get<{ bounds: MapExtent | null }>(
          `/catalogue/layers/${objectName}/features/${encodeURIComponent(featureId)}/bounds`,
        )
      ).data.bounds,
    [api],
  );

  return { search, warehouseBounds };
};
