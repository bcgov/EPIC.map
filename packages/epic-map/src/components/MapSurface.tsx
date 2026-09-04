import { Box, Typography } from "@mui/material";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { useTheme } from "@mui/material/styles";
import { useMapWidget } from "@/widget/MapWidgetContext";
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
      {/*
        Proof that the host's session reaches the widget: both claims below come
        out of the token the host returns from getAccessToken(), and the widget
        holds no session of its own to read them from.
      */}
      <Typography variant="body2" color={theme.palette.text.secondary}>
        {identity
          ? `Logged in as ${[identity.name, identity.preferredUsername]
              .filter(Boolean)
              .join(", ")}`
          : "Not signed in to the host application"}
      </Typography>
    </Box>
  );
}
