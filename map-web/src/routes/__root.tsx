import { Box } from "@mui/material";
import AppLayout from "@/components/Shared/Layout/AppLayout";
import PageNotFound from "@/components/Shared/PageNotFound";
import { createRootRouteWithContext, Outlet, useMatches } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { AuthContextProps } from "react-oidc-context";

type RouterContext = {
  authentication: AuthContextProps;
};

// Pages that are part of the sign-in flow rather than of the application, and
// so are shown without the app shell around them.
const BARE_ROUTE_IDS = ["/oidc-callback", "/session-expired"];

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  notFoundComponent: () => (
    <AppLayout>
      <PageNotFound />
    </AppLayout>
  ),
});

function Layout() {
  const matches = useMatches();
  const isBareRoute = matches.some((match) => BARE_ROUTE_IDS.includes(match.routeId));

  if (isBareRoute) {
    return (
      <>
        <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <Outlet />
        </Box>
        <TanStackRouterDevtools />
      </>
    );
  }

  return (
    <>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <TanStackRouterDevtools />
    </>
  );
}
