import { Box, Link, Slider, Typography } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import type { CatalogueLayer } from "@/api/useCatalogueSearch";
import { useLayers } from "@/components/Layers/LayersContext";
import { DEFAULT_LAYER_OPACITY } from "@/utils/config";

/**
 * A filled navy track with a solid thumb, plus the states the design calls for:
 * a pale halo on hover, a ring on the focused thumb, and a larger thumb with a
 * wider halo while dragging.
 */
const sliderSx = (theme: Theme) => ({
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
  const { opacities, setOpacity } = useLayers();

  const opacity = opacities[layer.id] ?? DEFAULT_LAYER_OPACITY;

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
          <Typography component="span" id={`${layer.id}-opacity`} sx={labelSx}>
            Opacity
          </Typography>
          <Typography
            component="span"
            sx={{ ...valueSx, fontWeight: theme.typography.fontWeightBold }}
          >
            {opacity}%
          </Typography>
        </Box>

        <Slider
          value={opacity}
          onChange={(_, value) => setOpacity(layer.id, value as number)}
          disabled={!layer.objectName}
          aria-labelledby={`${layer.id}-opacity`}
          getAriaValueText={(value) => `${value} percent`}
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
          {layer.lastUpdated && detail("Last updated", layer.lastUpdated)}
          {layer.description && detail("Description", layer.description)}
        </Box>

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
      </Box>
    </Box>
  );
}
