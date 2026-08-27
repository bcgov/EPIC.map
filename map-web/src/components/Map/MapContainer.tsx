import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { BCDesignTokens } from "epic.theme";
import { useApiReadiness } from "@/hooks/useApiStatus";

/**
 * Placeholder for the map surface. The map itself is not built yet, so this
 * fills the map area and reports whether the web app can reach the API.
 */
export default function MapContainer() {
  const { isPending, isError, error, data } = useApiReadiness();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        flex: 1,
        minHeight: 0,
        padding: "2rem",
        background: BCDesignTokens.surfaceColorBackgroundLightGray,
      }}
    >
      <Box
        sx={{
          padding: "1rem",
          background: BCDesignTokens.surfaceColorBackgroundWhite,
          border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
          borderRadius: BCDesignTokens.layoutBorderRadiusMedium,
        }}
      >
        <MapOutlinedIcon
          fontSize="large"
          sx={{ color: BCDesignTokens.surfaceColorBorderActive }}
        />
      </Box>
      <Typography variant="h3" color={BCDesignTokens.typographyColorPrimary}>
        Map goes here
      </Typography>
      {isPending && (
        <Box display={"flex"} alignItems={"center"} gap={"0.5rem"}>
          <CircularProgress size={20} />
          <Typography variant="body1" color={BCDesignTokens.typographyColorSecondary}>
            Connecting to the API...
          </Typography>
        </Box>
      )}
      {isError && (
        <Alert severity="error">
          Could not reach the API readiness endpoint: {error.message}
        </Alert>
      )}
      {data && (
        <Alert severity="success">
          Connected to the API - <b>{data.message}</b>
        </Alert>
      )}
    </Box>
  );
}
