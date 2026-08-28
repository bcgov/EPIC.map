import { Avatar, Typography } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import { useAuth } from "react-oidc-context";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";

export default function UserInitialBadge() {
  const auth = useAuth();
  const userInitials = `${auth.user?.profile?.given_name?.charAt(0) ?? ""}${auth.user?.profile?.family_name?.charAt(0) ?? ""}`;
  return (
    <Avatar
      sx={{
        width: "2rem",
        height: "2rem",
        backgroundColor: auth.isAuthenticated
          ? BCDesignTokens.themePrimaryBlue
          : BCDesignTokens.surfaceColorBackgroundLightGray,
        border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
        color: auth.isAuthenticated
          ? BCDesignTokens.typographyColorPrimaryInvert
          : BCDesignTokens.typographyColorPrimary,
      }}
    >
      {auth.isAuthenticated ? (
        <Typography
          sx={{
            fontSize: BCDesignTokens.typographyFontSizeLabel,
            fontWeight: BCDesignTokens.typographyFontWeightsBold,
            color: BCDesignTokens.iconsColorPrimaryInvert,
          }}
          aria-label="user-initials"
        >
          {userInitials}
        </Typography>
      ) : (
        <PersonOutlineOutlinedIcon sx={{ fontSize: "1.125rem" }} />
      )}
    </Avatar>
  );
}
