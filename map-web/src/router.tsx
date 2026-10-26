import { useEffect, useState } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import { routeTree } from "@/routeTree.gen";

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    // authentication will initially be undefined
    // We'll be passing down the authentication state from within a React component
    authentication: undefined!,
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function RouterProviderWithAuthContext() {
  const authentication = useAuth();
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    // automaticSilentRenew does the renewing; these are how it reports failure.
    const removeSilentRenewError = authentication.events.addSilentRenewError(() =>
      setIsSessionExpired(true),
    );

    const removeExpired = authentication.events.addAccessTokenExpired(() =>
      setIsSessionExpired(true),
    );

    return () => {
      removeSilentRenewError();
      removeExpired();
    };
  }, [authentication]);

  useEffect(() => {
    if (isSessionExpired) {
      router.navigate({ to: "/session-expired", replace: true });
    }
  }, [isSessionExpired]);

  return <RouterProvider router={router} context={{ authentication }} />;
}
