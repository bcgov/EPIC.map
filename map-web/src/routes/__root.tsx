import AppLayout from "@/components/Shared/Layout/AppLayout";
import PageNotFound from "@/components/Shared/PageNotFound";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { AuthContextProps } from "react-oidc-context";

type RouterContext = {
  authentication: AuthContextProps;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  notFoundComponent: () => (
    <AppLayout>
      <PageNotFound />
    </AppLayout>
  ),
});

function Layout() {
  return (
    <>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <TanStackRouterDevtools />
    </>
  );
}
