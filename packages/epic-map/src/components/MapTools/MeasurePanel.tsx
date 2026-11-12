import { Box, Button, createSvgIcon, Typography } from "@mui/material";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import { useTheme } from "@mui/material/styles";
import { SECONDARY_TEXT } from "@/components/Filters/filterTokens";
import { useMeasure } from "@/components/MapTools/MeasureContext";
import {
  formatArea,
  formatDistance,
  lineLength,
  polygonArea,
  segmentLengths,
} from "@/components/MapTools/measure";
import {
  primaryButtonSx,
  secondaryButtonSx,
  SMALL_TEXT,
  ToolFooter,
  ToolHint,
  ToolPanel,
} from "@/components/MapTools/ToolPanel";

export const MEASURE_HINT = "Click points on the map to measure or draw an area.";

const hintSx = { ...SMALL_TEXT, color: SECONDARY_TEXT } as const;

// Material's area_chart, which @mui/icons-material 5 lacks.
const AreaChartIcon = createSvgIcon(
  <path d="m17 7-5-4-5 7-4-3v13h18V7h-4zm2 9.95-7-5.45L8 17l-3-2.4V11l2.44 1.83 4.96-6.95L16.3 9H19v7.95z" />,
  "AreaChart",
);

/** The Measure card under the tool bar. */
export default function MeasurePanel() {
  const theme = useTheme();
  const { points, finished, closed, closable, undo, finish, close, clear } = useMeasure();
  const navy = theme.palette.primary.main;

  if (points.length === 0) {
    return (
      <ToolPanel>
        <ToolHint>{MEASURE_HINT}</ToolHint>
      </ToolPanel>
    );
  }

  const segments = closed ? [] : segmentLengths(points);
  const [Icon, heading, total] = closed
    ? [AreaChartIcon, "Selected Area", formatArea(polygonArea(points))]
    : [StraightenOutlinedIcon, "Line length", formatDistance(lineLength(points))];

  return (
    <ToolPanel>
      <Box sx={{ minHeight: 0, overflowY: "auto", padding: "0.75rem 1rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", color: navy }}>
          <Icon sx={{ fontSize: "1.125rem" }} />
          <Typography component="h2" sx={{ ...SMALL_TEXT, flexGrow: 1, fontWeight: 700 }}>
            {heading}
          </Typography>
          <Typography sx={{ ...SMALL_TEXT, fontWeight: 700 }}>~{total}</Typography>
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
          <Box sx={{ marginTop: "0.5rem" }}>
            <Typography sx={hintSx}>Click Done to measure the line</Typography>
            {closable && <Typography sx={hintSx}>Close shape to measure area</Typography>}
          </Box>
        )}
      </Box>

      <ToolFooter>
        {finished ? (
          <Button
            onClick={clear}
            sx={{ ...secondaryButtonSx(theme), ...(closed && { flexBasis: "100%" }) }}
          >
            Clear
          </Button>
        ) : (
          // Close shape takes its own row: three buttons do not fit across.
          <Box
            sx={{
              flexGrow: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem 1rem",
            }}
          >
            <Button onClick={undo} sx={secondaryButtonSx(theme)}>
              Undo
            </Button>
            <Button onClick={finish} disabled={points.length < 2} sx={primaryButtonSx(theme)}>
              Done
            </Button>
            {closable && (
              <Button onClick={close} sx={{ ...secondaryButtonSx(theme), gridColumn: "1 / -1" }}>
                Close shape
              </Button>
            )}
          </Box>
        )}
      </ToolFooter>
    </ToolPanel>
  );
}
