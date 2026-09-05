import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { AccessTokenError } from "@/api/errors";
import { epicMapQueryKey } from "@/api/queryKeys";
import { useMapWidget } from "@/widget/MapWidgetContext";

/**
 * The signed-in user as map-api reports them, from `GET /users/me`.
 *
 * Only the fields this package displays. The endpoint returns more; adding one
 * here is not a breaking change, so the shape is deliberately narrow.
 */
export interface CurrentUser {
  /** Primary key of the row in map-db. */
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  /** What the token entitles the user to do, e.g. `["User"]`. */
  permissions: string[];
}

/**
 * Ask map-api who the caller is.
 *
 * This is the widget's proof that the host's token is *trusted* rather than
 * merely present: reaching a 200 means map-api pulled Keycloak's JWKS, verified
 * the signature, issuer and expiry, checked the token's `azp` against its client
 * allowlist, and then read the user's row out of map-db. None of that can be
 * faked by a caller holding a hand-written JWT.
 *
 * The token itself never appears here — the axios instance from context attaches
 * it, exactly as it will for every other call this package makes.
 */
export const useCurrentUser = () => {
  const { api } = useMapWidget();

  const { data, isPending, error } = useQuery({
    queryKey: epicMapQueryKey("users", "me"),
    queryFn: async ({ signal }) => {
      const response = await api.get<CurrentUser>("/users/me", { signal });
      return response.data;
    },
    // A rejected token stays rejected: the axios instance has already retried a
    // 401 once with a freshly requested token. Retrying here only delays saying so.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: data ?? null,
    isPending,
    error,
    /** The host's getAccessToken rejected, so no request was ever made. */
    tokenUnavailable: error instanceof AccessTokenError,
    /** Status of the failed response, when the failure came from one. */
    status: axios.isAxiosError(error) ? error.response?.status : undefined,
  };
};
