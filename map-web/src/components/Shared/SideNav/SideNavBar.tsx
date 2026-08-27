import { Box, List, ListItem, ListItemButton, ListItemText } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link, useRouterState } from "@tanstack/react-router";
import { BCDesignTokens } from "epic.theme";
import { NAV_ITEMS } from "@/components/Shared/SideNav/navItems";
import { APP_SIDE_NAV_WIDTH } from "@/utils/constants";

const ITEM_BACKGROUND = alpha(BCDesignTokens.themePrimaryBlue, 0.08);
const ITEM_BACKGROUND_HOVER = alpha(BCDesignTokens.themePrimaryBlue, 0.16);
const ITEM_BACKGROUND_ACTIVE = alpha(BCDesignTokens.themeGold100, 0.12);

/** Left hand navigation rail. */
export default function SideNavBar() {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  return (
    <Box
      component="nav"
      sx={{
        width: `${APP_SIDE_NAV_WIDTH}px`,
        flexShrink: 0,
        height: "100%",
        backgroundColor: BCDesignTokens.surfaceColorBackgroundWhite,
        borderRight: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
        overflowY: "auto",
      }}
    >
      <List sx={{ padding: 0, marginTop: "0.5rem" }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(String(item.path));
          return (
            <ListItem key={item.name} disablePadding sx={{ paddingBottom: "0.25rem" }}>
              <ListItemButton
                component={Link}
                to={item.path}
                disableRipple
                sx={{
                  padding: "0.625rem 1rem 0.625rem 1.75rem",
                  borderLeft: `4px solid ${BCDesignTokens.themePrimaryBlue}`,
                  backgroundColor: active ? ITEM_BACKGROUND_ACTIVE : ITEM_BACKGROUND,
                  textDecoration: "none",
                  "&:hover": {
                    backgroundColor: active
                      ? ITEM_BACKGROUND_ACTIVE
                      : ITEM_BACKGROUND_HOVER,
                  },
                }}
              >
                <ListItemText
                  primary={item.name}
                  sx={{ margin: 0 }}
                  primaryTypographyProps={{
                    fontSize: BCDesignTokens.typographyFontSizeSmallBody,
                    fontWeight: BCDesignTokens.typographyFontWeightsBold,
                    lineHeight: "1.3125rem",
                    color: alpha(BCDesignTokens.themePrimaryBlue, active ? 1 : 0.8),
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
