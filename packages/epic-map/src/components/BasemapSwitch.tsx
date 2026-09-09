import { ButtonBase, Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BASEMAPS, otherBasemap, type BasemapId } from "@/config";

type BasemapSwitchProps = {
  current: BasemapId;
  onSelect: (basemap: BasemapId) => void;
};

export default function BasemapSwitch({
  current,
  onSelect,
}: BasemapSwitchProps) {
  const theme = useTheme();

  const next = otherBasemap(current);
  const { label, thumbnail } = BASEMAPS[next];

  return (
    <ButtonBase
      onClick={() => onSelect(next)}
      aria-label={`Switch to ${label} basemap`}
      title={label}
      sx={{
        position: "absolute",
        right: "3rem",
        bottom: "1.875rem",
        padding: "3px",
        backgroundColor: theme.palette.common.white,
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: theme.shadows[3],
        "&:hover": { boxShadow: theme.shadows[6] },
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "3.5rem",
          height: "2.75rem",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <Box
          component="img"
          src={thumbnail}
          alt=""
          loading="lazy"
          draggable={false}
          sx={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          }}
        />
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            insetInline: 0,
            bottom: 0,
            padding: "3px 0",
            textAlign: "center",
            fontSize: "0.6875rem",
            fontWeight: theme.typography.fontWeightBold,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            color: theme.palette.common.white,
            textShadow: "0 1px 3px rgba(0, 0, 0, 0.6)",
          }}
        >
          {label}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
