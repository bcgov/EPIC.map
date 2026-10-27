import { Box } from "@mui/material";
import { PROJECT_DOT_SIZES, TEXT_COLOR } from "@/components/Projects/projectUtils";

/** Sized from the real data: most names fit one line, long ones take two. */
const MAX_WIDTH_PX = 220;

/** Enough to clear the largest dot. */
const OFFSET_PX = PROJECT_DOT_SIZES.selected.diameter / 2 + 6;

type ProjectTooltipProps = {
  name: string;
  /** Where the dot is, in container pixels. */
  left: number;
  top: number;
};

/** The hovered project's name, on a small card above its dot. */
export default function ProjectTooltip({ name, left, top }: ProjectTooltipProps) {
  return (
    <Box
      sx={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        transform: `translate(-50%, calc(-100% - ${OFFSET_PX}px))`,
        zIndex: 2,
        // Never in the way of the click the hover is inviting.
        pointerEvents: "none",
        maxWidth: `${MAX_WIDTH_PX}px`,
        px: 0.75,
        py: 0.5,
        backgroundColor: "#ffffff",
        border: "1px solid #d9d9d9",
        borderRadius: "4px",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.2)",
        color: TEXT_COLOR,
        // 12.5px, the size the design sets.
        fontSize: "0.78125rem",
        lineHeight: 1.3,
        textAlign: "left",
        // Wraps to a second line, then clamps with an ellipsis.
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 2,
        overflow: "hidden",
        overflowWrap: "anywhere",
      }}
    >
      {name}
    </Box>
  );
}
