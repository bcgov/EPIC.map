import { Box, Typography } from "@mui/material";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { useTheme } from "@mui/material/styles";
import { useMapWidget } from "@/widget/MapWidgetContext";
import { useCurrentUser } from "@/api/useCurrentUser";
import { useHostIdentity } from "@/widget/useHostIdentity";

/**
 * The map surface.
 *
 * Still a placeholder: maplibre is a dependency but nothing renders through it
 * yet. What is real is the boundary — this reads its project and the signed-in
 * user from widget context, not from a router, an environment variable or a
 * session of its own.
 */
export default function MapSurface() {
  const theme = useTheme();
  const { config } = useMapWidget();
  const identity = useHostIdentity();
  const { user, isPending, error, tokenUnavailable, status } = useCurrentUser();

  // Deliberately explicit about which state the demo is in. A blank line while
  // the round trip is in flight would look the same as a rejected token, and the
  // ways this can fail are not interchangeable: 401 means Keycloak or the client
  // allowlist turned the token down, 403 means it was accepted and the user is
  // simply not entitled here.
  const verification = (() => {
    if (user) {
      return {
        label: `Verified by Keycloak \u00b7 map-db user #${user.id} \u00b7 ${
          user.permissions.join(", ") || "no permissions"
        }`,
        color: theme.palette.success.main,
      };
    }
    if (isPending) {
      return {
        label: "Verifying the token with map-api\u2026",
        color: theme.palette.text.secondary,
      };
    }
    if (tokenUnavailable) {
      return {
        label: "The host application supplied no token",
        color: theme.palette.text.secondary,
      };
    }
    if (status === 403) {
      return {
        label: "Token verified, but this user is not entitled to the map",
        color: theme.palette.warning.main,
      };
    }
    return {
      label:
        status === 401
          ? "map-api rejected this token"
          : "Could not reach map-api",
      color: error ? theme.palette.error.main : theme.palette.text.secondary,
    };
  })();

  return (
    <Box
      sx={{
        // Fills whatever the widget root gives it. No vh/vw, no position: fixed.
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        backgroundColor: theme.palette.background.default,
      }}
    >
      <Box
        sx={{
          padding: "1rem",
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: `${theme.shape.borderRadius}px`,
        }}
      >
        <MapOutlinedIcon
          fontSize="large"
          sx={{ color: theme.palette.primary.main }}
        />
      </Box>
      <Typography variant="h3" color={theme.palette.text.primary}>
        Map goes here
      </Typography>
      <Typography variant="caption" color={theme.palette.text.secondary}>
        {config.projectId
          ? `Project ${config.projectId}`
          : "No project selected"}
      </Typography>
      <Typography variant="body2" color={theme.palette.text.primary}>
        {identity
          ? `Logged in as ${[identity.name, identity.preferredUsername]
              .filter(Boolean)
              .join(", ")}`
          : "Not signed in to the host application"}
      </Typography>
      <Typography variant="caption" color={verification.color}>
        {verification.label}
      </Typography>
    </Box>
  );
}
