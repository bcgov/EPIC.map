import { useCallback } from "react";
import { Box } from "@mui/material";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import MapWidgetRemote from "@/components/Map/MapWidgetRemote";
// Temporarily off while the map surface is being built out — the banner sits
// under the map and eats vertical space the map wants. Put it back by
// uncommenting this import and the <ApiStatusBar /> below.
// import ApiStatusBar from "@/components/Map/ApiStatusBar";
import { AppConfig } from "@/utils/config";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
});

/**
 * Reference host for the EPIC map remote.
 *
 * Everything the widget needs is handed to it here: the API url comes from this
 * application's config, and the token comes from this application's session. The
 * widget reads neither for itself - see packages/epic-map/README.md.
 *
 * The map arrives over Module Federation rather than from this bundle, so it is
 * reached through MapWidgetRemote, which owns the loading and failure states.
 * Its props are the widget's own; if something needed here is not in
 * @bcgov/epic-map-types, that is a defect in the widget's public API.
 *
 * The widget's optional props - projectId, initialExtent, height, onError and
 * onFeatureSelect - are deliberately not passed yet. A dev-only panel that drove
 * them at runtime was removed to keep this page minimal; it can come back, or be
 * replaced by tests in the package itself.
 */
function MapPage() {
  const { user } = useAuth();

  const getAccessToken = useCallback(async () => {
    const token = user?.access_token;
    if (!token) {
      throw new Error("No access token in the host session");
    }
    return token;
  }, [user]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <MapWidgetRemote
          apiBaseUrl={AppConfig.apiUrl}
          getAccessToken={getAccessToken}
        />
      </Box>
      {/* <ApiStatusBar /> */}
    </Box>
  );
}
