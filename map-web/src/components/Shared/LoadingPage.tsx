import { Box, CircularProgress, Typography } from "@mui/material";

type LoadingPageProps = {
  isLoading?: boolean;
  message?: string;
};

/** Full-height spinner, used while the session is being established. */
export default function LoadingPage({
  isLoading = false,
  message = "Loading",
}: LoadingPageProps) {
  if (!isLoading) return null;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <CircularProgress size={64} aria-label="Loading spinner" />
      <Typography variant="h5" fontWeight={400}>
        {message}
      </Typography>
    </Box>
  );
}
