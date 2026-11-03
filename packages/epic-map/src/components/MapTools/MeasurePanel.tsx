import { Box, Button, Typography } from "@mui/material";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import { useTheme } from "@mui/material/styles";
import { SECONDARY_TEXT } from "@/components/Filters/filterTokens";
import { useMeasure } from "@/components/MapTools/MeasureContext";
import { formatDistance, lineLength, segmentLengths } from "@/components/MapTools/measure";
import {
  primaryButtonSx,
  secondaryButtonSx,
  SMALL_TEXT,
  ToolFooter,
  ToolHint,
  ToolPanel,
} from "@/components/MapTools/ToolPanel";

export const MEASURE_HINT = "Click points on the map to measure or draw an area.";

/** The Measure card under the tool bar. */
export default function MeasurePanel() {
  const theme = useTheme();
  const { points, finished, undo, finish, clear } = useMeasure();
  const navy = theme.palette.primary.main;

  if (points.length === 0) {
    return (
      <ToolPanel>
        <ToolHint>{MEASURE_HINT}</ToolHint>
      </ToolPanel>
    );
  }

  const segments = segmentLengths(points);

  return (
    <ToolPanel>
      <Box sx={{ minHeight: 0, overflowY: "auto", padding: "0.75rem 1rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", color: navy }}>
          <StraightenOutlinedIcon sx={{ fontSize: "1.125rem" }} />
          <Typography component="h2" sx={{ ...SMALL_TEXT, flexGrow: 1, fontWeight: 700 }}>
            Line length
          </Typography>
          <Typography sx={{ ...SMALL_TEXT, fontWeight: 700 }}>
            ~{formatDistance(lineLength(points))}
          </Typography>
        </Box>

        {segments.length > 0 && (
          <Box component="ul" sx={{ margin: "0.25rem 0 0", padding: 0, listStyle: "none" }}>
            {segments.map((metres, i) => (
              <Box
                component="li"
                key={i}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  padding: "0.1875rem 0",
                  ...SMALL_TEXT,
                  color: theme.palette.text.primary,
                }}
              >
                <span>
                  Point {i + 1} &rarr; Point {i + 2}
                </span>
                <span>~{formatDistance(metres)}</span>
              </Box>
            ))}
          </Box>
        )}

        {!finished && points.length > 1 && (
          <Typography sx={{ ...SMALL_TEXT, marginTop: "0.5rem", color: SECONDARY_TEXT }}>
            Click Done to measure the line
          </Typography>
        )}
      </Box>

      <ToolFooter>
        {finished ? (
          <Button onClick={clear} sx={secondaryButtonSx(theme)}>
            Clear
          </Button>
        ) : (
          <>
            <Button onClick={undo} sx={secondaryButtonSx(theme)}>
              Undo
            </Button>
            <Button onClick={finish} disabled={points.length < 2} sx={primaryButtonSx(theme)}>
              Done
            </Button>
          </>
        )}
      </ToolFooter>
    </ToolPanel>
  );
}
