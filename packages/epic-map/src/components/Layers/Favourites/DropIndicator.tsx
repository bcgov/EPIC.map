import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

/**
 * Where the dragged layer will land: a rule with a dot at its head.
 *
 * Drawn at the top of the container under the row, which is where map-api puts
 * an arriving layer.
 */
export default function DropIndicator({
  margin = "0.25rem 1rem",
}: {
  margin?: string;
}) {
  const theme = useTheme();

  return (
    <Box
      aria-hidden
      sx={{
        position: "relative",
        margin,
        height: "2px",
        borderRadius: "1px",
        backgroundColor: theme.palette.primary.main,
        "&::before": {
          content: '""',
          position: "absolute",
          top: "50%",
          left: 0,
          transform: "translate(-25%, -50%)",
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          backgroundColor: theme.palette.primary.main,
        },
      }}
    />
  );
}
