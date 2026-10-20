import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import { stripMarkdown, truncate } from "@/utils/text";
import {
  CATALOGUE_DATASET_URL,
  CATALOGUE_DESCRIPTION_LIMIT,
  CATALOGUE_SEARCH_ROWS,
  CATALOGUE_SEARCH_URL,
  MIN_CATALOGUE_QUERY_LENGTH,
} from "@/utils/config";

/** A catalogue dataset, reduced to what the layers panel shows and draws. */
export interface CatalogueLayer {
  id: string;
  packageId: string;
  objectName: string | null;
  name: string;
  /** The record's last modified date as YYYY-MM-DD, or "" when it has none. */
  lastUpdated: string;
  description: string | null;
  /** Null for a layer we host, which has no catalogue dataset page. */
  metadataUrl: string | null;
}

/** The slice of CKAN's package_search response this package relies on. */
interface CkanResource {
  format?: string;
  object_name?: string;
}

interface CkanPackage {
  id: string;
  title: string;
  /** The dataset description, authored as Markdown. */
  notes?: string;
  record_last_modified?: string;
  resources?: CkanResource[];
}

interface CkanSearchResponse {
  success: boolean;
  result?: { results?: CkanPackage[] };
}

// map-api stores the date as a date, so anything else is dropped, not sent.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toCatalogueLayer = (pkg: CkanPackage): CatalogueLayer => {
  const wms = pkg.resources?.find(
    (resource) => resource.format?.toLowerCase() === "wms",
  );

  const modified = pkg.record_last_modified ?? "";
  const description = truncate(
    stripMarkdown(pkg.notes ?? ""),
    CATALOGUE_DESCRIPTION_LIMIT,
  );

  return {
    id: `cat-${pkg.id}`,
    packageId: pkg.id,
    objectName: wms?.object_name ?? null,
    name: pkg.title,
    lastUpdated: ISO_DATE.test(modified) ? modified : "",
    description: description || null,
    metadataUrl: `${CATALOGUE_DATASET_URL}/${pkg.id}`,
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
