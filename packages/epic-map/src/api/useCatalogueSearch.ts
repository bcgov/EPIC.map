import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import {
  CATALOGUE_DATASET_URL,
  CATALOGUE_SEARCH_ROWS,
  CATALOGUE_SEARCH_URL,
  MIN_CATALOGUE_QUERY_LENGTH,
} from "@/utils/config";

/** A catalogue dataset, reduced to what the layers panel shows and draws. */
export interface CatalogueLayer {
  id: string;
  name: string;
  wmsObjectName: string | null;
  lastUpdated: string;
  metadataUrl: string;
}

/** The slice of CKAN's package_search response this package relies on. */
interface CkanResource {
  format?: string;
  object_name?: string;
}

interface CkanPackage {
  id: string;
  name: string;
  title: string;
  record_last_modified?: string;
  resources?: CkanResource[];
}

interface CkanSearchResponse {
  success: boolean;
  result?: { results?: CkanPackage[] };
}

const formatDate = (value?: string): string => {
  if (!value) return "";
  // Midday avoids the date shifting a day backwards west of UTC.
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
};

const toCatalogueLayer = (pkg: CkanPackage): CatalogueLayer => {
  const wms = pkg.resources?.find(
    (resource) => resource.format?.toLowerCase() === "wms",
  );

  return {
    id: `cat-${pkg.id}`,
    name: pkg.title,
    wmsObjectName: wms?.object_name ?? null,
    lastUpdated: formatDate(pkg.record_last_modified),
    metadataUrl: `${CATALOGUE_DATASET_URL}/${pkg.name}`,
  };
};

/** Search the BC Data Catalogue for datasets published as WMS. */
export const useCatalogueSearch = (query: string) => {
  const { publicApi } = useMapWidget();

  const trimmed = query.trim();
  const enabled = trimmed.length >= MIN_CATALOGUE_QUERY_LENGTH;

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: epicMapQueryKey("catalogue", "search", trimmed),
    queryFn: async ({ signal }) => {
      const response = await publicApi.get<CkanSearchResponse>(
        CATALOGUE_SEARCH_URL,
        {
          signal,
          params: {
            q: trimmed,
            rows: CATALOGUE_SEARCH_ROWS,
            fq: "res_format:wms",
          },
        },
      );

      if (!response.data.success) {
        throw new Error("BC Data Catalogue rejected the search");
      }

      return (response.data.result?.results ?? []).map(toCatalogueLayer);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    layers: data ?? [],
    // `isPending` is true for a disabled query too, so pairing it with isFetching.
    isLoading: enabled && isPending && isFetching,
    error,
    retry: refetch,
  };
};
