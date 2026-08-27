import { PropsWithChildren } from "react";
import { Box } from "@mui/material";
import { BCDesignTokens } from "epic.theme";
import EAOAppBar from "@/components/Shared/Header/EAOAppBar";
import SideNavBar from "@/components/Shared/SideNav/SideNavBar";
import { APP_HEADER_HEIGHT } from "@/utils/constants";

/** App shell: app bar on top, nav rail on the left, page content on the right. */
export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <>
      <EAOAppBar />
      <Box
        sx={{
          display: "flex",
          overflow: "hidden",
          height: `calc(100vh - ${APP_HEADER_HEIGHT}px)`,
        }}
      >
        <SideNavBar />
        <Box
          component="main"
          display={"flex"}
          flexDirection={"column"}
          flex={1}
          minWidth={0}
          overflow={"auto"}
          sx={{ backgroundColor: BCDesignTokens.surfaceColorBackgroundWhite }}
        >
          {children}
        </Box>
      </Box>
    </>
  );
}
