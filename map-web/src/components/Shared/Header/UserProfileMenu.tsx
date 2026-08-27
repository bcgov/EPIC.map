import { Avatar, Box, Menu, MenuItem, Typography } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import { theme } from "@/styles/theme";
import { useAuth } from "react-oidc-context";

type UserProfileMenuProps = {
  anchorEl: HTMLElement | null;
  handleClose: () => void;
};

/** Details of the signed in user, opened from the app bar. */
export default function UserProfileMenu({ anchorEl, handleClose }: UserProfileMenuProps) {
  const { user, signoutRedirect } = useAuth();

  const userInitials = `${user?.profile?.given_name?.charAt(0) ?? ""}${user?.profile?.family_name?.charAt(0) ?? ""}`;

  return (
    <Menu
      id="profile-menu"
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={handleClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      MenuListProps={{
        style: {
          paddingTop: 0,
          paddingBottom: 0,
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", width: 320 }}>
        <Box
          sx={{
            display: "flex",
            gap: "0.5rem",
            padding: "1rem",
            bgcolor: BCDesignTokens.surfaceColorBackgroundLightGray,
            borderBottom: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
            alignItems: "center",
          }}
        >
          <Avatar
            sx={{
              bgcolor: theme.palette.primary.main,
              width: "2rem",
              height: "2rem",
            }}
          >
            <Typography
              variant="body2"
              fontWeight={BCDesignTokens.typographyFontWeightsBold}
              color={theme.palette.primary.contrastText}
              aria-label="user-initials"
            >
              {userInitials}
            </Typography>
          </Avatar>
          <Typography variant="body2" fontWeight={BCDesignTokens.typographyFontWeightsBold}>
            {user?.profile?.name}
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: "0.5rem",
            padding: "1rem",
            flexDirection: "column",
          }}
        >
          <Typography variant="body2" fontWeight={BCDesignTokens.typographyFontWeightsBold}>
            Contact
          </Typography>
          <Typography variant="body2" color={BCDesignTokens.themeBlue90}>
            {user?.profile?.email}
          </Typography>
        </Box>
        <MenuItem
          onClick={() => {
            handleClose();
            signoutRedirect();
          }}
          sx={{
            padding: "1rem",
            borderTop: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
          }}
        >
          <Typography variant="body2" color={BCDesignTokens.typographyColorLink}>
            Sign Out
          </Typography>
        </MenuItem>
      </Box>
    </Menu>
  );
}
