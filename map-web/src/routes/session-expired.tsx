import { Box, Button, Typography } from "@mui/material";
import { createFileRoute } from "@tanstack/react-router";
import { BCDesignTokens } from "epic.theme";
import { useAuth } from "react-oidc-context";

export const Route = createFileRoute("/session-expired")({
  component: SessionExpired,
});

/** Shown when the access token could not be renewed. */
function SessionExpired() {
  const { signinRedirect } = useAuth();

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 2,
        mx: 4,
      }}
    >
      <Typography variant="h3" sx={{ color: BCDesignTokens.typographyColorLink }}>
        Session Expired
      </Typography>
      <Typography variant="h5" fontWeight={400}>
        Your session has expired. Please sign in again to continue.
      </Typography>
      <Button variant="contained" onClick={() => signinRedirect()}>
        Sign In
      </Button>
    </Box>
  );
}
