import { useState } from "react";
import { Avatar, Button, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import { BCDesignTokens } from "epic.theme";
import { useAuth } from "react-oidc-context";
import UserProfileMenu from "@/components/Shared/Header/UserProfileMenu";
import { theme } from "@/styles/theme";
import { REDIRECT_URL_STORAGE_KEY } from "@/utils/config";

/** Sign in button / signed in user control shown at the right of the app bar. */
export default function SignInControl() {
  const auth = useAuth();
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] = useState<HTMLElement | null>(null);

  const userInitials = `${auth.user?.profile?.given_name?.charAt(0) ?? ""}${auth.user?.profile?.family_name?.charAt(0) ?? ""}`;

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
          {auth.isAuthenticated ? `Hello, ${auth.user?.profile.given_name}` : "Sign In"}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{
            fontSize: "1rem",
            color: BCDesignTokens.typographyColorSecondary,
          }}
        />
        <Avatar
          sx={{
            width: "2rem",
            height: "2rem",
            backgroundColor: auth.isAuthenticated
              ? theme.palette.primary.main
              : BCDesignTokens.surfaceColorBackgroundLightGray,
            border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
            color: auth.isAuthenticated
              ? theme.palette.primary.contrastText
              : BCDesignTokens.typographyColorPrimary,
          }}
        >
          {auth.isAuthenticated ? (
            <Typography
              sx={{
                fontSize: BCDesignTokens.typographyFontSizeLabel,
                fontWeight: BCDesignTokens.typographyFontWeightsBold,
              }}
              aria-label="user-initials"
            >
              {userInitials}
            </Typography>
          ) : (
            <PersonOutlineOutlinedIcon sx={{ fontSize: "1.125rem" }} />
          )}
        </Avatar>
      </Button>
      <UserProfileMenu
        anchorEl={profileMenuAnchorEl}
        handleClose={() => setProfileMenuAnchorEl(null)}
      />
    </>
  );
}
