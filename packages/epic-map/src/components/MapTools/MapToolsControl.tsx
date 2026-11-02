import { useEffect, type ReactNode } from "react";
import { Box, Button } from "@mui/material";
import HighlightAltOutlinedIcon from "@mui/icons-material/HighlightAltOutlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { BORDER_DEFAULT } from "@/components/Filters/filterTokens";
import { eaoFeatureAt } from "@/components/Layers/eaoVisibility";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";
import SelectAreaPanel from "@/components/MapTools/SelectAreaPanel";
import { hasProjectAt } from "@/components/Projects/projectUtils";
import { MAP_TOOLS_WIDTH, METADATA_TOLERANCE_PX } from "@/utils/config";

type ToolButtonProps = {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
};

function ToolButton({ label, icon, active, onClick }: ToolButtonProps) {
  const theme = useTheme();

  return (
    <Button
      onClick={onClick}
      aria-pressed={active}
      startIcon={icon}
      sx={{
        flex: "1 1 auto",
        height: "2.5rem",
        padding: "0 1rem",
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: theme.shadows[2],
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightMedium,
        textTransform: "none",
        whiteSpace: "nowrap",
        "& .MuiButton-startIcon": { margin: "0 0.5rem 0 0" },
        "& .MuiButton-startIcon > svg": { fontSize: "1.5rem" },
        ...(active
          ? {
              backgroundColor: theme.palette.primary.main,
              border: `1px solid ${theme.palette.primary.main}`,
              color: theme.palette.primary.contrastText,
              "&:hover": { backgroundColor: theme.palette.primary.dark },
            }
          : {
              backgroundColor: theme.palette.common.white,
              border: `1px solid ${BORDER_DEFAULT}`,
              color: theme.palette.text.primary,
              "&:hover": {
                backgroundColor: theme.palette.common.white,
                borderColor: theme.palette.grey[500],
              },
            }),
      }}
    >
      {label}
    </Button>
  );
}

type MapToolsControlProps = {
  map: MapLibreMap | null;
  /** Pixels covered on the map's right edge. */
  insetRight?: number;
};

/** Select area and Measure, top right; one on at a time. */
export default function MapToolsControl({
  map,
  insetRight = 0,
}: MapToolsControlProps) {
  const { tool: active, toggleTool: toggle, add } = useSelectArea();
  const selecting = active === "select";

  // A dot still opens its project card.
  useEffect(() => {
    if (!map || !selecting) return undefined;

    const onClick = (event: MapMouseEvent) => {
      if (hasProjectAt(map, event.point)) return;
      const feature = eaoFeatureAt(map, event.point, METADATA_TOLERANCE_PX);
      if (feature) add(feature);
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, selecting, add]);

  return (
    <Box
      sx={{
        position: "absolute",
        top: "1rem",
        right: `calc(1rem + ${insetRight}px)`,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        maxHeight: "calc(100% - 2rem)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexShrink: 0,
          gap: "0.5rem",
          width: MAP_TOOLS_WIDTH,
        }}
      >
        <ToolButton
          label="Select area"
          icon={<HighlightAltOutlinedIcon />}
          active={selecting}
          onClick={() => toggle("select")}
        />
        {/* Measuring itself is a later ticket; the button only toggles. */}
        <ToolButton
          label="Measure"
          icon={<StraightenOutlinedIcon />}
          active={active === "measure"}
          onClick={() => toggle("measure")}
        />
      </Box>

      <Box role="status" sx={{ display: "flex", minHeight: 0 }}>
        {selecting && <SelectAreaPanel />}
      </Box>
    </Box>
  );
}
