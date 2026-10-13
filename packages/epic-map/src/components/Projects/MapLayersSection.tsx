import { Box, Typography } from "@mui/material";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import {
  BODY_TEXT,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";

const EMPTY_TEXT_COLOR = "#757371";

/**
 * A project's published project and value component layers. None are published
 * anywhere yet, so this is only ever the empty state.
 */
export default function MapLayersSection() {
  return (
    <Box
      component="section"
      aria-labelledby="epic-map-project-layers"
      sx={{ padding: "1rem", borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <LayersOutlinedIcon aria-hidden sx={{ fontSize: "1.25rem", color: TEXT_COLOR }} />
        <Typography
          id="epic-map-project-layers"
          component="h3"
          sx={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.5, color: TEXT_COLOR }}
        >
          Map Layers
        </Typography>
      </Box>
      <Typography
        sx={{
          marginTop: "0.75rem",
          padding: "0.5rem 0.75rem",
          border: "1px dashed #c6c5c3",
          borderRadius: "0.25rem",
          backgroundColor: "#fafafa",
          ...BODY_TEXT,
          color: EMPTY_TEXT_COLOR,
        }}
      >
        No project or value components published yet for this project.
      </Typography>
    </Box>
  );
}
