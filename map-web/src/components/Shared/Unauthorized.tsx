import { WarningAmberRounded } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import { useAuth } from "react-oidc-context";

type UnauthorizedProps = {
  /** The IDIR account that was refused, so the user can quote it in a request. */
  username?: string;
};

/**
 * Shown to someone who signed in with IDIR successfully but has no access to
 * EPIC.map. Signing out is offered because the usual cause is being signed in
 * as the wrong account.
 */
export default function Unauthorized({ username }: UnauthorizedProps) {
  const { signoutRedirect } = useAuth();

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 1,
        mx: 4,
      }}
    >
      <WarningAmberRounded
        sx={{ color: BCDesignTokens.iconsColorWarning, fontSize: 80, mb: 2 }}
        aria-label="Unauthorized warning icon"
      />
      <Typography variant="h3">Access Denied</Typography>
      <Typography variant="h5" fontWeight={400}>
        You are not authorized to access EPIC.map.
      </Typography>
      {username && (
        <Typography variant="body1" color={BCDesignTokens.typographyColorSecondary}>
          Signed in as {username}
        </Typography>
      )}
      <Typography variant="body1" sx={{ mt: 1 }}>
        Request access from your administrator, then sign in again.
      </Typography>
      <Button variant="contained" sx={{ mt: 2 }} onClick={() => signoutRedirect()}>
        Sign Out
      </Button>
    </Box>
  );
}
