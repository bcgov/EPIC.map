import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import type { MapWidgetProps } from "@bcgov/epic-map-types";

/**
 * The EPIC map, loaded over Module Federation.
 *
 * The map is not part of this bundle. It is fetched from its own deployment the
 * first time this component renders, which is what lets the map ship without
 * rebuilding and redeploying every application that embeds it.
 *
 * That trade has a cost this component exists to pay: a dependency that used to
 * be resolved at build time is now a network request that can fail. A failed
 * import is an unhandled rejection inside React's lazy boundary, which without
 * an error boundary unmounts the whole route tree - so a widget origin that is
 * down would take the rest of the application with it. It does not get to.
 */

// `lazy` outside the component, so the import is fired once per page load rather
// than on every render. Module Federation caches the module itself, but a new
// lazy() each render is a new component type, and React remounts the map.
const MapWidget = lazy(() => import("epicMap/MapWidget"));

interface MapWidgetRemoteProps extends MapWidgetProps {
  /** Height of the area the loading and failure states fill. */
  minHeight?: number | string;
}

const Centered = ({
  minHeight,
  children,
}: {
  minHeight: number | string;
  children: ReactNode;
}) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      minHeight,
      p: 3,
      textAlign: "center",
    }}
  >
    {children}
  </Box>
);

interface BoundaryProps {
  minHeight: number | string;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

/**
 * Catches a remote that would not load.
 *
 * Deliberately narrow: it covers the load, not the map's own runtime errors,
 * which the widget reports through `onError` so the host can decide what to do
 * without losing the map. Anything that reaches here means there is no map to
 * keep, so a retry is the only thing left to offer.
 */
class MapWidgetBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Reported to the console on purpose: this application has no error sink
    // yet, and swallowing it would make a misconfigured VITE_MAP_WIDGET_URL look
    // like an empty page with nothing to explain it.
    // eslint-disable-next-line no-console
    console.error("Failed to load the EPIC map remote", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Centered minHeight={this.props.minHeight}>
        <Typography variant="h6">The map could not be loaded</Typography>
        <Typography variant="body2" color="text.secondary">
          The map service did not respond. This is usually temporary.
        </Typography>
        <Button variant="outlined" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Centered>
    );
  }
}

/**
 * Reloading the page rather than clearing `failed` is the honest option.
 * Module Federation caches a remote's failed entry for the life of the page, so
 * re-rendering the boundary would re-throw without a second request ever
 * leaving the browser - a button that looks like it retried and did not.
 */
const MapWidgetRemote = ({ minHeight = 400, ...props }: MapWidgetRemoteProps) => (
  <MapWidgetBoundary minHeight={minHeight}>
    <Suspense
      fallback={
        <Centered minHeight={minHeight}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Loading the map…
          </Typography>
        </Centered>
      }
    >
      <MapWidget {...props} />
    </Suspense>
  </MapWidgetBoundary>
);

export default MapWidgetRemote;
