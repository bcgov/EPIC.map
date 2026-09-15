import { Box, Button, CircularProgress, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayerRow from "@/components/Layers/LayerRow";
import { useLayers } from "@/components/Layers/LayersContext";

/**
 * The layers the user has switched on, listed under the search that puts them
 * there. Restored from map-api, so a layer left on is still on next session.
 */
export default function EnabledLayers() {
  const theme = useTheme();
  const { appliedLayers, appliedPending, appliedError, retryApplied } =
    useLayers();

  const body = () => {
    if (appliedPending) {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0 1rem 0.5rem",
          }}
        >
          <CircularProgress size={14} />
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.secondary,
            }}
          >
            Loading your layers…
          </Typography>
        </Box>
      );
    }

    if (appliedError) {
      return (
        <Box sx={{ padding: "0 1rem 0.5rem", textAlign: "center" }}>
          <Typography
            sx={{
              fontSize: theme.typography.caption.fontSize,
              color: theme.palette.text.primary,
            }}
          >
            <WarningAmberIcon
              aria-hidden
              sx={{
                verticalAlign: "text-bottom",
                marginRight: "0.25rem",
                fontSize: "1rem",
                color: theme.palette.text.secondary,
              }}
            />
            Couldn&rsquo;t load your enabled layers
          </Typography>
          <Button
            variant="text"
            color="secondary"
            onClick={retryApplied}
            sx={{ fontSize: theme.typography.caption.fontSize }}
          >
            Try again
          </Button>
        </Box>
      );
    }

    if (appliedLayers.length === 0) {
      return (
        <DashedEmptyState>
          No layers are switched on. Turn one on above and it is saved to your
          account.
        </DashedEmptyState>
      );
    }

    return (
      <Box component="ul" sx={{ margin: 0, padding: 0 }}>
        {appliedLayers.map((layer) => (
          <LayerRow key={layer.id} layer={layer} />
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ marginTop: "0.5rem" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.625rem 1rem 0.5rem",
        }}
      >
        <Typography
          component="h3"
          sx={{
            margin: 0,
            fontSize: theme.typography.caption.fontSize,
            fontWeight: theme.typography.fontWeightBold,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: theme.palette.text.secondary,
          }}
        >
          Enabled layers
        </Typography>
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
          {appliedLayers.length}
        </Box>
      </Box>

      {body()}
    </Box>
  );
}
