import { useState } from "react";
import { Button, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { BCDesignTokens } from "epic.theme";
import { useAuth } from "react-oidc-context";
import UserProfileMenu from "@/components/Shared/Header/UserProfileMenu";
import { theme } from "@/styles/theme";
import { REDIRECT_URL_STORAGE_KEY } from "@/utils/config";
import UserInitialBadge from "./UserInitialBadge";

/** Sign in button / signed in user control shown at the right of the app bar. */
export default function SignInControl() {
  const auth = useAuth();
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] =
    useState<HTMLElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (auth.isAuthenticated) {
      setProfileMenuAnchorEl(event.currentTarget);
      return;
    }
    // Come back to the page they signed in from, not to the launchpad.
    window.sessionStorage.setItem(
      REDIRECT_URL_STORAGE_KEY,
      window.location.pathname + window.location.search,
    );
    auth.signinRedirect();
  };

  return (
    <>
      <Button
        variant="text"
        color="primary"
        onClick={handleClick}
        aria-haspopup="true"
        sx={{
          gap: "0.375rem",
          minWidth: 0,
          padding: "0.375rem 0.625rem",
          borderRadius: BCDesignTokens.layoutBorderRadiusMedium,
          "&:hover": {
            backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
          },
        }}
      >
        <Typography
          sx={{
            fontSize: BCDesignTokens.typographyFontSizeSmallBody,
            fontWeight: theme.typography.fontWeightMedium,
            color: BCDesignTokens.themePrimaryBlue,
          }}
        >
          {auth.isAuthenticated
            ? `Hello, ${auth.user?.profile.given_name}`
            : "Sign In"}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{
            fontSize: "1rem",
            color: BCDesignTokens.typographyColorSecondary,
          }}
        />
        <UserInitialBadge />
      </Button>
      <UserProfileMenu
        anchorEl={profileMenuAnchorEl}
        handleClose={() => setProfileMenuAnchorEl(null)}
      />
    </>
  );
}
