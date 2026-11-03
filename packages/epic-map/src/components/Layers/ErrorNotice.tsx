import { Box, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import TertiaryLink from "@/components/Filters/TertiaryLink";

type ErrorNoticeProps = {
  message: string;
  action: string;
  onAction: () => void;
  actionName?: string;
  alert?: boolean;
  padding?: string;
};

/** A panel error: the message, then its action as a tertiary button. */
export default function ErrorNotice({
  message,
  action,
  onAction,
  actionName,
  alert = false,
  padding = "0 1rem 0.5rem",
}: ErrorNoticeProps) {
  const theme = useTheme();

  return (
    <Box role={alert ? "alert" : undefined} sx={{ padding }}>
      <Typography
        sx={{
          fontSize: theme.typography.caption.fontSize,
          // Set with the size: the default is body1's, for larger text.
          lineHeight: 1.4,
          color: theme.palette.text.primary,
        }}
      >
        <WarningAmberIcon
          aria-hidden
          sx={{
            verticalAlign: "text-bottom",
            marginRight: "0.25rem",
            fontSize: "1rem",
            color: theme.palette.text.secondary,
          }}
        />
        {message}
      </Typography>
      <TertiaryLink onClick={onAction} aria-label={actionName}>
        {action}
      </TertiaryLink>
    </Box>
  );
}
