import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  BORDER_DARK,
  BORDER_DEFAULT,
  BUTTON_DISABLED_FILL,
  BUTTON_DISABLED_TEXT,
  HOVER_FILL,
  INFO_BORDER,
  INFO_FILL,
  INFO_ICON,
  MENU_SEPARATOR,
} from "@/components/Filters/filterTokens";

export const SMALL_TEXT = { fontSize: "0.75rem", lineHeight: 1.5 } as const;

/** The card under the tool bar. */
export const ToolPanel = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        width: "17.375rem",
        marginTop: "0.5rem",
        backgroundColor: theme.palette.common.white,
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: theme.shadows[3],
      }}
    >
      {children}
    </Box>
  );
};

/** A tool's empty state. */
export const ToolHint = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();

  return (
    <Box sx={{ padding: "0.75rem 1rem" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
          padding: "1rem 1.5rem",
          backgroundColor: INFO_FILL,
          border: `1px solid ${INFO_BORDER}`,
          borderRadius: `${theme.shape.borderRadius}px`,
        }}
      >
        <InfoOutlinedIcon
          sx={{
            flexShrink: 0,
            marginTop: "0.125rem",
            fontSize: "1.125rem",
            color: INFO_ICON,
          }}
        />
        <Typography sx={{ ...SMALL_TEXT, color: theme.palette.text.primary }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
};

export const ToolFooter = ({ children }: { children: ReactNode }) => (
  <Box
    sx={{
      display: "flex",
      flexShrink: 0,
      gap: "1rem",
      padding: "0.75rem 1rem",
      borderTop: `1px solid ${MENU_SEPARATOR}`,
    }}
  >
    {children}
  </Box>
);

const footerButtonSx = {
  // Half the row each, so a lone button keeps its size.
  flex: "0 0 calc(50% - 0.5rem)",
  height: "1.625rem",
  minWidth: 0,
  padding: "0 0.5rem",
  ...SMALL_TEXT,
  textTransform: "none",
  whiteSpace: "nowrap",
  "& .MuiButton-startIcon": { margin: "0 0.375rem 0 0" },
  "& .MuiButton-startIcon > svg": { fontSize: "1rem" },
} as const;

const disabledLook = {
  color: BUTTON_DISABLED_TEXT,
  backgroundColor: BUTTON_DISABLED_FILL,
  opacity: 1,
};
const disabledButtonSx = (borderColor: string) => ({
  "&.Mui-disabled": {
    ...disabledLook,
    borderColor,
    pointerEvents: "auto",
    cursor: "not-allowed",
    "&:hover, &:active": { ...disabledLook, borderColor },
  },
});

export const secondaryButtonSx = (theme: Theme) => ({
  ...footerButtonSx,
  border: `1px solid ${BORDER_DARK}`,
  color: theme.palette.text.primary,
  backgroundColor: theme.palette.common.white,
  "&:hover": { backgroundColor: HOVER_FILL },
  ...disabledButtonSx(BORDER_DEFAULT),
});

export const primaryButtonSx = (theme: Theme) => ({
  ...footerButtonSx,
  border: `1px solid ${theme.palette.primary.main}`,
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.primary.main,
  "&:hover": { backgroundColor: theme.palette.primary.dark },
  ...disabledButtonSx("transparent"),
});
