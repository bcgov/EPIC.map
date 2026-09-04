import { useCallback, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@mui/material";
import { MapWidgetProvider, type MapWidgetContextValue } from "@/widget/MapWidgetContext";
import { createApiClient } from "@/api/client";
import MapSearchBar from "@/components/MapSearchBar";
import MapSurface from "@/components/MapSurface";
import type { MapFeature, MapWidgetError, MapWidgetProps } from "@/types";

/**
 * MUI's `sx` reads a bare number below 1 as a percentage, which would quietly
 * turn `height={0.5}` into `50%`. Normalise here so the prop means what its type
 * says: number = pixels, string = verbatim.
 */
const toCssSize = (value: string | number): string =>
  typeof value === "number" ? `${value}px` : value;

/**
 * The embeddable EPIC map.
 *
 * Everything it needs arrives through props. It adds no router, no auth client
 * and no theme of its own; it renders into whatever container the host gives it.
 */
export const MapWidget = ({
  apiBaseUrl,
  getAccessToken,
  projectId,
  initialExtent,
  height = "100%",
  onFeatureSelect,
  onError,
}: MapWidgetProps) => {
  // Hosts commonly pass inline callbacks, whose identity changes every render.
  // Keeping them in a ref lets the axios instance and the context value stay
  // stable while still calling the host's current function — so a token is never
  // read from a stale closure.
  const callbacks = useRef({ getAccessToken, onFeatureSelect, onError });
  callbacks.current = { getAccessToken, onFeatureSelect, onError };

  const handleFeatureSelect = useCallback(
    (feature: MapFeature) => callbacks.current.onFeatureSelect?.(feature),
    [],
  );
  const handleError = useCallback(
    (error: MapWidgetError) => callbacks.current.onError?.(error),
    [],
  );

  const api = useMemo(
    () =>
      createApiClient({
        apiBaseUrl,
        getAccessToken: () => callbacks.current.getAccessToken(),
        onError: handleError,
      }),
    [apiBaseUrl, handleError],
  );

  const contextValue = useMemo<MapWidgetContextValue>(
    () => ({
      apiBaseUrl,
      api,
      config: {
        projectId,
        initialExtent,
        onFeatureSelect: handleFeatureSelect,
        onError: handleError,
      },
    }),
    [apiBaseUrl, api, projectId, initialExtent, handleFeatureSelect, handleError],
  );

  // The widget's own QueryClient, nested inside whatever the host already has.
  // One per widget instance, created lazily so it survives re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MapWidgetProvider value={contextValue}>
        <Box
          sx={{
            // Sizes to its container: no viewport units, no position: fixed.
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: toCssSize(height),
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <MapSearchBar />
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <MapSurface />
          </Box>
        </Box>
      </MapWidgetProvider>
    </QueryClientProvider>
  );
};
