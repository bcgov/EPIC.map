import { AppBar, Box, Divider, Toolbar, Typography } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import EAO_Logo from "@/assets/images/EAO_Logo.png";
import SignInControl from "@/components/Shared/Header/SignInControl";
import { AppConfig } from "@/utils/config";
import { APP_HEADER_HEIGHT } from "@/utils/constants";

/** Top application bar: BC/EAO branding, app title and the sign in control. */
export default function EAOAppBar() {
  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{
        backgroundColor: BCDesignTokens.surfaceColorBackgroundWhite,
        borderBottom: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
        boxShadow: "none",
      }}
    >
      <Toolbar
        sx={{
          height: `${APP_HEADER_HEIGHT}px`,
          minHeight: `${APP_HEADER_HEIGHT}px !important`,
          padding: "0 0.75rem 0 1rem !important",
        }}
      >
        <Box display={"flex"} alignItems={"center"}>
          <Box
            component="img"
            src={EAO_Logo}
            alt="Government of British Columbia - Environmental Assessment Office"
            sx={{ height: "3rem", display: "block", flexShrink: 0 }}
          />
          <Divider
            orientation="vertical"
            sx={{
              height: "2.25rem",
              margin: "0 0.75rem",
              borderColor: BCDesignTokens.surfaceColorBorderDefault,
            }}
          />
          <Typography
            component="h1"
            sx={{
              fontSize: BCDesignTokens.typographyFontSizeBody,
              fontWeight: BCDesignTokens.typographyFontWeightsBold,
              color: BCDesignTokens.typographyColorPrimary,
              whiteSpace: "nowrap",
            }}
          >
            {AppConfig.appTitle}
          </Typography>
        </Box>
        <Box flexGrow={1} />
        <SignInControl />
      </Toolbar>
    </AppBar>
  );
}
