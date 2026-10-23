import { Box, Link, Slider, Typography } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { useLocalLayerInfo } from "@/api/useLocalLayerInfo";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  DEFAULT_LAYER_LINE_WIDTH,
  DEFAULT_LAYER_OPACITY,
  LAYER_LINE_WIDTH_STEP,
  MAX_LAYER_LINE_WIDTH,
  MIN_LAYER_LINE_WIDTH,
} from "@/utils/config";
import { hasWidthSlider, isLocalLayer } from "@/utils/localLayers";
import { formatDate } from "@/utils/text";

/**
 * A filled navy track with a solid thumb, plus the states the design calls for:
 * a pale halo on hover, a ring on the focused thumb, and a larger thumb with a
 * wider halo while dragging.
 */
export const sliderSx = (theme: Theme) => ({
  padding: "0.5rem 0",
  marginTop: "0.5rem",
  color: theme.palette.primary.main,
  "& .MuiSlider-rail": {
    height: "0.25rem",
    opacity: 1,
    backgroundColor: theme.palette.grey[400],
  },
  "& .MuiSlider-track": { height: "0.25rem", border: "none" },
  "& .MuiSlider-thumb": {
    width: "1rem",
    height: "1rem",
    backgroundColor: theme.palette.primary.main,
    transition: theme.transitions.create(["box-shadow", "width", "height"], {
      duration: theme.transitions.duration.shortest,
    }),
    "&:hover": {
      boxShadow: `0 0 0 0.375rem ${theme.palette.primary.main}1F`,
    },
    "&.Mui-focusVisible": {
      boxShadow: `0 0 0 0.1875rem ${theme.palette.common.white}, 0 0 0 0.3125rem ${theme.palette.primary.main}`,
    },
    "&.Mui-active": {
      width: "1.125rem",
      height: "1.125rem",
      boxShadow: `0 0 0 0.625rem ${theme.palette.primary.main}29`,
    },
  },
  "&.Mui-disabled": {
    color: theme.palette.action.disabled,
    "& .MuiSlider-thumb": {
      backgroundColor: theme.palette.action.disabled,
      boxShadow: "none",
    },
  },
});

/**
 * The detail panel under an expanded layer row.
 */
export default function LayerInfo({ layer }: { layer: CatalogueLayer }) {
  const theme = useTheme();
  const { opacities, setOpacity, lineWidths, setLineWidth } = useLayers();

  const opacity = opacities[layer.id] ?? DEFAULT_LAYER_OPACITY;

  // One slider, a width instead of an opacity for a layer drawn as outlines.
  const width = hasWidthSlider(layer.objectName);
  const lineWidth = lineWidths[layer.id] ?? DEFAULT_LAYER_LINE_WIDTH;

  // A hosted layer carries no catalogue record, so its date is the day map-api
  // last loaded the extract it is serving - asked for only for those layers.
  const hosted = isLocalLayer(layer.objectName);
  const { data: hostedInfo } = useLocalLayerInfo(
    hosted ? (layer.objectName as string) : null,
  );
  const lastUpdated = formatDate(
    hosted ? hostedInfo?.loadedDate : layer.lastUpdated,
  );

  const labelSx = {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.4,
    color: theme.palette.text.disabled,
  };
  const valueSx = {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.4,
    color: theme.palette.text.primary,
  };

  /** Label and value share one grid, so every value starts on the same line. */
  const detail = (label: string, value: string) => (
    <>
      <Typography component="dt" sx={labelSx}>
        {label}
      </Typography>
      <Typography component="dd" sx={{ ...valueSx, margin: 0 }}>
        {value}
      </Typography>
    </>
  );

  return (
    <Box
      sx={{
        padding: "0.25rem 1rem",
      }}
    >
      <Box
        sx={{
          backgroundColor: theme.palette.grey[100],
          padding: "0.5rem 1rem",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <Typography component="span" id={`${layer.id}-slider`} sx={labelSx}>
            {width ? "Line width" : "Opacity"}
          </Typography>
          <Typography
            component="span"
            sx={{ ...valueSx, fontWeight: theme.typography.fontWeightBold }}
          >
            {width ? `${lineWidth.toFixed(1)} px` : `${opacity}%`}
          </Typography>
        </Box>

        {/* onChange, not onChangeCommitted, so the drag is live. */}
        <Slider
          value={width ? lineWidth : opacity}
          onChange={(_, value) =>
            width
              ? setLineWidth(layer.id, value as number)
              : setOpacity(layer.id, value as number)
          }
          min={width ? MIN_LAYER_LINE_WIDTH : 0}
          max={width ? MAX_LAYER_LINE_WIDTH : 100}
          step={width ? LAYER_LINE_WIDTH_STEP : 1}
          disabled={!layer.objectName}
          aria-labelledby={`${layer.id}-slider`}
          getAriaValueText={(value) =>
            width ? `${value.toFixed(1)} pixels` : `${value} percent`
          }
          sx={sliderSx(theme)}
        />

        <Box
          component="dl"
          sx={{
            display: "grid",
            gridTemplateColumns: "4.5rem 1fr",
            columnGap: "0.5rem",
            rowGap: "0.25rem",
            margin: "0.375rem 0 0",
          }}
        >
          {lastUpdated && detail("Last updated", lastUpdated)}
          {layer.description && detail("Description", layer.description)}
        </Box>

        {/* A layer we host has no catalogue page, so there is nothing to open. */}
        {layer.metadataUrl && (
          <Link
            href={layer.metadataUrl}
            target="_blank"
            // noopener keeps the new tab from reaching back through window.opener.
            rel="noopener noreferrer"
            sx={{
              display: "inline-block",
              marginTop: "0.75rem",
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.primary.dark,
              textDecorationColor: "currentcolor",
            }}
          >
            View full metadata
          </Link>
        )}
      </Box>
    </Box>
  );
}
