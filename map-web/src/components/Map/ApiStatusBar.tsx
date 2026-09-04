import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import { useApiReadiness } from "@/hooks/useApiStatus";

/**
 * Reports whether this application can reach the API.
 *
 * This is the health check that used to live inside MapContainer. It stayed in
 * map-web when the map UI moved to @bcgov/epic-map: reachability of the service
 * is the host's concern, and the readiness probe sits on /ops, outside the /api
 * URL the widget is given. A widget embedded in someone else's tab has no
 * business rendering "Connecting to the API...".
 */
export default function ApiStatusBar() {
  const { isPending, isError, error, data } = useApiReadiness();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        borderTop: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
        background: BCDesignTokens.surfaceColorBackgroundLightGray,
      }}
    >
      {isPending && (
        <>
          <CircularProgress size={20} />
          <Typography
            variant="body1"
            color={BCDesignTokens.typographyColorSecondary}
          >
            Connecting to the API...
          </Typography>
        </>
      )}
      {isError && (
        <Alert severity="error">
          Could not reach the API readiness endpoint: {error.message}
        </Alert>
      )}
      {data && (
        <Alert severity="success">
          Connected to the API - <b>{data.message}</b>
        </Alert>
      )}
    </Box>
  );
}
