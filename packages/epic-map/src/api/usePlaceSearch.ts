import { useQuery } from "@tanstack/react-query";
import { epicMapQueryKey } from "@/utils/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";
import {
  toPlaceResults,
  type GeocoderResponse,
  type PlaceResult,
} from "@/components/Search/searchUtils";
import {
  GEOCODER_SEARCH_URL,
  MIN_PLACE_QUERY_LENGTH,
  PLACE_SEARCH_MAX_RESULTS,
  PLACE_SEARCH_STALE_MS,
} from "@/utils/config";

const NONE: PlaceResult[] = [];

/**
 * Search the BC Address Geocoder for places matching `query`.
 *
 * Aborting a superseded request and caching by query string both come from
 * react-query rather than from anything written here: the query key is the
 * trimmed string, so a key that changes while a request is in flight aborts it
 * through the `signal`, and a key seen before inside `PLACE_SEARCH_STALE_MS`
 * answers from the cache without a request at all. Typing forward and then
 * backspacing — which is most of what a search field sees — costs nothing.
 *
 * The caller passes an already-debounced query. Debouncing here would tie the
 * delay to the fetch, and the field needs the undebounced string too, to decide
 * whether what is on screen is still settling.
 */
export const usePlaceSearch = (query: string) => {
  const { publicApi } = useMapWidget();

  const trimmed = query.trim();
  const enabled = trimmed.length >= MIN_PLACE_QUERY_LENGTH;

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: epicMapQueryKey("places", "search", trimmed),
    queryFn: async ({ signal }) => {
      const response = await publicApi.get<GeocoderResponse>(
        GEOCODER_SEARCH_URL,
        {
          signal,
          params: {
            addressString: trimmed,
            maxResults: PLACE_SEARCH_MAX_RESULTS,
            // Resolves a civic number by interpolating along its block when the
            // address itself is not in the table. See GEOCODER_SEARCH_URL.
            interpolation: "adaptive",
          },
        },
      );

      return toPlaceResults(response.data);
    },
    enabled,
    staleTime: PLACE_SEARCH_STALE_MS,
  });

  return {
    places: data ?? NONE,
    // `isPending` is true for a disabled query too, so it is paired with
    // isFetching — otherwise an empty field would read as permanently loading.
    isLoading: enabled && isPending && isFetching,
    error,
  };
};
