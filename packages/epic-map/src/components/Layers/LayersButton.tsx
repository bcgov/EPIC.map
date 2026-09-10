import { Button } from "@mui/material";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { useTheme } from "@mui/material/styles";

type LayersButtonProps = {
  open: boolean;
  onToggle: () => void;
};

/**
 * Opens and closes the layers panel.
 *
 * Sits over the top-left of the map canvas rather than in the search bar above
 * it: the panel it opens is a map overlay, so the control that summons it reads
 * as part of the map.
 */
export default function LayersButton({ open, onToggle }: LayersButtonProps) {
  const theme = useTheme();

  return (
    <Button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="epic-map-layers-panel"
      startIcon={<LayersOutlinedIcon sx={{ fontSize: "1.125rem" }} />}
      sx={{
        position: "absolute",
        left: "1rem",
        top: "1rem",
        height: "2.25rem",
        padding: "0 0.875rem",
        backgroundColor: theme.palette.common.white,
        border: `1px solid ${open ? theme.palette.grey[500] : theme.palette.divider}`,
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: theme.shadows[2],
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightMedium,
        color: theme.palette.text.primary,
        whiteSpace: "nowrap",
        "&:hover": {
          backgroundColor: theme.palette.common.white,
          borderColor: theme.palette.grey[500],
        },
      }}
    >
      Layers
    </Button>
  );
}
