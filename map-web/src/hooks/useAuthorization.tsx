import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { AxiosError } from "axios";
import { request } from "@/utils/axiosUtils";
import { CurrentUser, Permission } from "@/models/User";

const CURRENT_USER_QUERY_KEY = ["users", "me"];

const fetchCurrentUser = (): Promise<CurrentUser> =>
  request({ url: "/users/me", method: "get" });

/**
 * The signed-in user's profile and permissions, fetched once per session.
 *
 * The first call also provisions the user's local record on the API side, so
 * this is what turns an IDIR sign-in into an EPIC.map user.
 */
export const useCurrentUser = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const query = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    enabled: isAuthenticated,
    // A rejected user stays rejected; retrying only delays telling them.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const status = (query.error as AxiosError)?.response?.status;

  return {
    ...query,
    user: query.data ?? null,
    isLoading: isAuthLoading || (isAuthenticated && query.isLoading),
    /** Signed in with IDIR, but not entitled to this application. */
    isAccessDenied: status === 401 || status === 403,
  };
};

/** Whether the signed-in user holds at least one of the given permissions. */
export const useHasPermission = (permissions: Permission[]): boolean => {
  const { user } = useCurrentUser();

  return useMemo(
    () => permissions.some((permission) => user?.permissions?.includes(permission)),
    [permissions, user],
  );
};
