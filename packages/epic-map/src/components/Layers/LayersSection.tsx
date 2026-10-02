import type { ReactNode } from "react";
import { Box, Collapse, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";

type LayersSectionProps = {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  divider?: boolean;
  /** Shown under the header whether or not the section is collapsed. */
  pinned?: ReactNode;
  children: ReactNode;
};

export default function LayersSection({
  id,
  title,
  count,
  action,
  expanded,
  onToggle,
  divider = true,
  pinned,
  children,
}: LayersSectionProps) {
  const theme = useTheme();
  const collapsible = onToggle !== undefined;
  const bodyId = `${id}-body`;

  const header = (
    <Box
      component={collapsible ? "button" : "div"}
      type={collapsible ? "button" : undefined}
      onClick={onToggle}
      aria-expanded={collapsible ? expanded : undefined}
      aria-controls={collapsible ? bodyId : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        width: "100%",
        padding: "1rem 1rem 0.75rem",
        font: "inherit",
        textAlign: "left",
        border: "none",
        backgroundColor: "transparent",
        ...(collapsible && {
          cursor: "pointer",
          "&:hover": { backgroundColor: theme.palette.grey[50] },
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: "-2px",
          },
        }),
      }}
    >
      {collapsible && (
        <KeyboardArrowDownIcon
          aria-hidden
          sx={{
            flexShrink: 0,
            fontSize: "1.25rem",
            color: theme.palette.primary.main,
            transition: theme.transitions.create("transform"),
            transform: expanded ? "none" : "rotate(-90deg)",
          }}
        />
      )}
      <Typography
        component="span"
        sx={{
          fontSize: theme.typography.body2.fontSize,
          fontWeight: theme.typography.fontWeightBold,
          color: theme.palette.text.primary,
        }}
      >
        {title}
      </Typography>
      {count !== undefined && (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "1.25rem",
            height: "1.125rem",
            padding: "0 0.3125rem",
            borderRadius: `${theme.shape.borderRadius}px`,
            backgroundColor: theme.palette.primary.light,
            color: theme.palette.primary.main,
            fontSize: "0.6875rem",
            fontWeight: theme.typography.fontWeightBold,
            lineHeight: 1,
          }}
        >
          {count}
        </Box>
      )}
      <Box sx={{ flexGrow: 1 }} />
      {action}
    </Box>
  );

  return (
    <Box
      component="section"
      sx={{
        borderBottom: divider ? `1px solid ${theme.palette.divider}` : "none",
      }}
    >
      {header}
      {pinned}
      <Collapse in={expanded ?? true} id={bodyId}>
        <Box sx={{ paddingBottom: "0.5rem" }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
