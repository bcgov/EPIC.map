import { Box, Button, IconButton, LinearProgress, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { useTheme } from "@mui/material/styles";
import {
  formatUploadSize,
  uploadPercent,
  uploadStatusLabel,
  type UploadRow,
} from "@/components/Layers/UserLayers/uploadUtils";

/**
 * One file on its way to My Layers: name, percent, bar and status while it
 * sends; the reason and, where it could help, Try Again once it has failed.
 */
export default function UploadProgressRow({
  upload,
  onCancel,
  onRetry,
  onDismiss,
}: {
  upload: UploadRow;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const failed = upload.status === "failed";
  const percent = uploadPercent(upload);

  const caption = {
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 1.5,
  } as const;

  return (
    <Box
      sx={{ padding: "0 1rem 0.75rem" }}
      aria-label={`Upload of ${upload.fileName}`}
      role="group"
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        {failed ? (
          <ErrorOutlineIcon
            aria-hidden
            sx={{ fontSize: "1rem", color: theme.palette.error.main }}
          />
        ) : (
          <InsertDriveFileOutlinedIcon
            aria-hidden
            sx={{ fontSize: "1rem", color: theme.palette.text.secondary }}
          />
        )}
        <Typography
          title={upload.fileName}
          sx={{
            flexGrow: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: theme.typography.body2.fontSize,
            color: theme.palette.text.primary,
          }}
        >
          {upload.fileName}
        </Typography>
        {!failed && (
          <Typography
            sx={{
              fontSize: theme.typography.body2.fontSize,
              color: theme.palette.text.primary,
            }}
          >
            {percent}%
          </Typography>
        )}
        <IconButton
          size="small"
          aria-label={
            failed
              ? `Dismiss ${upload.fileName}`
              : `Cancel upload of ${upload.fileName}`
          }
          onClick={failed ? onDismiss : onCancel}
          sx={{ padding: "0.125rem" }}
        >
          <CloseIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Box>

      {failed ? (
        <Box
          role="alert"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            marginTop: "0.25rem",
          }}
        >
          <Typography sx={{ ...caption, color: theme.palette.error.main }}>
            {upload.error}
          </Typography>
          {upload.retryable && (
            <Button
              size="small"
              onClick={onRetry}
              sx={{
                flexShrink: 0,
                minWidth: 0,
                padding: "0 0.25rem",
                fontSize: theme.typography.caption.fontSize,
                fontWeight: theme.typography.fontWeightBold,
                textTransform: "none",
              }}
            >
              Try Again
            </Button>
          )}
        </Box>
      ) : (
        <>
          <LinearProgress
            variant="determinate"
            value={percent}
            aria-label={`${upload.fileName} upload progress`}
            sx={{
              marginTop: "0.375rem",
              height: "0.25rem",
              borderRadius: "0.125rem",
              backgroundColor: theme.palette.grey[200],
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.5rem",
              marginTop: "0.25rem",
            }}
          >
            <Typography
              aria-live="polite"
              sx={{ ...caption, color: theme.palette.text.secondary }}
            >
              {uploadStatusLabel(upload.status)}
            </Typography>
            {upload.total > 0 && (
              <Typography sx={{ ...caption, color: theme.palette.text.secondary }}>
                {formatUploadSize(upload.loaded, upload.total)}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
