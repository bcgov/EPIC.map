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
 */
function Authenticated() {
  const { isAuthenticated, isLoading, signinRedirect, user } = useAuth();
  const {
    isLoading: isLoadingCurrentUser,
    isAccessDenied,
    user: currentUser,
  } = useCurrentUser();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    // Remember where they were headed so the callback can put them back there.
    window.sessionStorage.setItem(
      REDIRECT_URL_STORAGE_KEY,
      window.location.pathname + window.location.search,
    );
    signinRedirect();
  }, [isAuthenticated, isLoading, signinRedirect]);

  if (isLoading || !isAuthenticated) {
    return <LoadingPage isLoading message="Signing in" />;
  }

  // Signed in with IDIR, but the API has not agreed they belong here.
  if (isAccessDenied) {
    return <Unauthorized username={user?.profile?.preferred_username} />;
  }

  if (isLoadingCurrentUser || !currentUser) {
    return <LoadingPage isLoading />;
  }

  return <Outlet />;
}
