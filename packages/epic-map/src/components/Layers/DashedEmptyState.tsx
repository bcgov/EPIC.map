import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

/** The dashed "nothing here yet" box used by Favourites and My Layers. */
export default function DashedEmptyState({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        margin: "0 1rem 0.5rem",
        padding: "0.75rem",
        background: theme.palette.grey[50],
        border: `1px dashed ${theme.palette.divider}`,
        borderRadius: `${theme.shape.borderRadius}px`,
      }}
    >
      <Typography
        sx={{
          fontSize: theme.typography.caption.fontSize,
          lineHeight: 1.5,
          color: theme.palette.text.disabled,
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}
