import { Box, Divider, Link, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ErrorNotice from "@/components/Layers/ErrorNotice";
import LayerRow from "@/components/Layers/LayerRow";
import { useLayers } from "@/components/Layers/LayersContext";

/**
 * Layers the user switched on from search, shown above the results. Favourites
 * are left out: they are listed, and switched, under Favourites.
 */
export default function EnabledLayers() {
  const theme = useTheme();
  const {
    searchEnabledLayers,
    appliedPending,
    favouritesPending,
    appliedError,
    retryApplied,
    turnAllOff,
  } = useLayers();

  const layers = favouritesPending ? [] : searchEnabledLayers;
  const hasLayers = layers.length > 0;

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
          {layers.length}
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
        <ErrorNotice
          message={
            hasLayers
              ? "Couldn’t refresh your enabled layers"
              : "Couldn’t load your enabled layers"
          }
          action="Try again"
          onAction={retryApplied}
        />
      )}

      {hasLayers && (
        <Box component="ul" sx={{ margin: 0, padding: 0 }}>
          {layers.map((layer) => (
            <LayerRow key={layer.id} layer={layer} />
          ))}
        </Box>
      )}

      <Divider sx={{ margin: "0.5rem 1rem 0" }} />
    </Box>
  );
}
