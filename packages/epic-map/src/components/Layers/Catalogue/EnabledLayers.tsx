import { Box, Button, Divider, Link, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import LayerRow from "@/components/Layers/LayerRow";
import { useLayers } from "@/components/Layers/LayersContext";

/** Layers the user has switched on, shown above the search results. */
export default function EnabledLayers() {
  const theme = useTheme();
  const {
    appliedLayers,
    appliedPending,
    appliedError,
    retryApplied,
    turnAllOff,
  } = useLayers();

  const hasLayers = appliedLayers.length > 0;

  if (appliedPending || (!hasLayers && !appliedError)) return null;

  return (
    <Box sx={{ marginBottom: "0.5rem" }}>
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
            fontSize: "0.75rem",
            lineHeight: "1.125rem",
            fontWeight: theme.typography.fontWeightBold,
            color: theme.palette.text.primary,
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
        {hasLayers && (
          <Link
            component="button"
            type="button"
            onClick={turnAllOff}
            underline="always"
            sx={{
              marginLeft: "auto",
              fontSize: "0.75rem",
              lineHeight: "1.125rem",
            }}
          >
            Turn All Off
          </Link>
        )}
      </Box>

      {Boolean(appliedError) && (
        <Box
          sx={{
            padding: "0 1rem 0.5rem",
            textAlign: hasLayers ? "left" : "center",
          }}
        >
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
            {hasLayers
              ? "Couldn’t refresh your enabled layers"
              : "Couldn’t load your enabled layers"}
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
      )}

      {hasLayers && (
        <Box component="ul" sx={{ margin: 0, padding: 0 }}>
          {appliedLayers.map((layer) => (
            <LayerRow key={layer.id} layer={layer} />
          ))}
        </Box>
      )}

      <Divider sx={{ margin: "0.5rem 1rem 0" }} />
    </Box>
  );
}
