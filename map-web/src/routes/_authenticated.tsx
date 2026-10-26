import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import LoadingPage from "@/components/Shared/LoadingPage";
import Unauthorized from "@/components/Shared/Unauthorized";
import { useCurrentUser } from "@/hooks/useAuthorization";
import { REDIRECT_URL_STORAGE_KEY } from "@/utils/config";

export const Route = createFileRoute("/_authenticated")({
  component: Authenticated,
});

/**
 * Layout route that fronts every page requiring an IDIR sign-in.
 *
 * The check lives in a component rather than in `beforeLoad` on purpose:
 * react-oidc-context reports `isAuthenticated: false` while it is still
 * restoring a session from storage, so a guard that fired before `isLoading`
 * cleared would bounce an already signed-in user on every page refresh.
 *
 * Swapping the tree out once signed in unmounts the map, so the states below
 * read from whether there is a session, not from what is in flight (MAP-87).
 *
 * Exported for tests.
 */
export function Authenticated() {
  const { isAuthenticated, isLoading, signinRedirect, user } = useAuth();
  const { isAccessDenied, user: currentUser } = useCurrentUser();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    // Remember where they were headed so the callback can put them back there.
    window.sessionStorage.setItem(
      REDIRECT_URL_STORAGE_KEY,
      window.location.pathname + window.location.search,
    );
    signinRedirect();
  }, [isAuthenticated, isLoading, signinRedirect]);

  // A renewal sets `isLoading`, not `isAuthenticated`.
  if (!isAuthenticated) {
    return <LoadingPage isLoading message="Signing in" />;
  }

  // Signed in with IDIR, but the API has not agreed they belong here.
  if (isAccessDenied) {
    return <Unauthorized username={user?.profile?.preferred_username} />;
  }

  // Only before the first one arrives: react-query keeps data across refetches.
  if (!currentUser) {
    return <LoadingPage isLoading />;
  }

  return <Outlet />;
}
