import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import LoadingPage from "@/components/Shared/LoadingPage";
import Unauthorized from "@/components/Shared/Unauthorized";
import { useCurrentUser } from "@/hooks/useAuthorization";
import { REDIRECT_URL_STORAGE_KEY } from "@/utils/config";

export const Route = createFileRoute("/oidc-callback")({
  component: OidcCallback,
});

/** Where Keycloak returns the user after an IDIR sign-in. */
function OidcCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, user } = useAuth();
  const {
    isLoading: isLoadingCurrentUser,
    isAccessDenied,
    user: currentUser,
  } = useCurrentUser();

  const isReady = !isLoading && isAuthenticated && !!currentUser;

  useEffect(() => {
    if (!isReady) return;

    // Put the user back where they were before being sent off to sign in.
    const redirectUrl =
      window.sessionStorage.getItem(REDIRECT_URL_STORAGE_KEY) || "/";
    window.sessionStorage.removeItem(REDIRECT_URL_STORAGE_KEY);
    navigate({ to: redirectUrl, replace: true });
  }, [isReady, navigate]);

  if (error) {
    return <Unauthorized username={user?.profile?.preferred_username} />;
  }

  if (isAccessDenied) {
    return <Unauthorized username={user?.profile?.preferred_username} />;
  }

  return (
    <LoadingPage
      isLoading
      message={isLoading || isLoadingCurrentUser ? "Signing in" : "Redirecting"}
    />
  );
}
