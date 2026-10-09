import { Button } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { useTheme } from "@mui/material/styles";
import {
  ACTIVE_FILL,
  ACTIVE_HOVER_FILL,
  BORDER_DEFAULT,
  CONTROL_HEIGHT,
  focusRing,
  HOVER_FILL,
} from "@/components/Filters/filterTokens";

type FilterToggleProps = {
  label: string;
  on: boolean;
  onToggle: () => void;
};

/**
 * One of the bar's on/off filters: Certificate issued, In-progress works.
 *
 * Never disabled, even when turning it on would empty the map. A control the
 * user cannot turn off is a dead end; a combination that matches nothing is
 * explained over the map instead.
 */
export default function FilterToggle({ label, on, onToggle }: FilterToggleProps) {
  const theme = useTheme();

  return (
    <Button
      onClick={onToggle}
      aria-pressed={on}
      disableRipple
      startIcon={on ? <CheckIcon sx={{ fontSize: "1.125rem" }} /> : undefined}
      sx={{
        height: CONTROL_HEIGHT,
        padding: "0 0.75rem",
        borderRadius: `${theme.shape.borderRadius}px`,
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightRegular,
        whiteSpace: "nowrap",
        textTransform: "none",
        ...(on
          ? {
              backgroundColor: ACTIVE_FILL,
              border: `1px solid ${theme.palette.primary.main}`,
              color: theme.palette.primary.main,
              "&:hover": { backgroundColor: ACTIVE_HOVER_FILL },
            }
          : {
              backgroundColor: theme.palette.common.white,
              border: `1px solid ${BORDER_DEFAULT}`,
              color: theme.palette.text.primary,
              "&:hover": { backgroundColor: HOVER_FILL },
            }),
        ...focusRing,
      }}
    >
      {label}
    </Button>
  );
}
