import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { alpha, useTheme } from "@mui/material/styles";
import { focusRing } from "@/components/Layers/LayerRow";

/**
 * Asked in place of an imported layer's row before it is deleted for good.
 *
 * Cancel takes focus, so Enter straight after choosing Delete from the menu
 * cannot delete the layer by accident.
 */
export default function DeleteLayerConfirm({
  layerName,
  onCancel,
  onDelete,
}: {
  layerName: string;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const theme = useTheme();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => cancelRef.current?.focus(), []);

  const confirm = async () => {
    setDeleting(true);
    setFailed(false);
    try {
      // On success the row goes, and this with it.
      await onDelete();
    } catch {
      setDeleting(false);
      setFailed(true);
    }
  };

  const buttonSx = {
    flexShrink: 0,
    minWidth: 0,
    height: "1.625rem",
    padding: "0 0.625rem",
    fontSize: theme.typography.body2.fontSize,
    textTransform: "none",
    boxShadow: "none",
    ...focusRing(theme),
  } as const;

  return (
    <Box
      role="group"
      aria-label={`Delete ${layerName}?`}
      aria-busy={deleting}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !deleting) onCancel();
      }}
      sx={{
        borderRadius: `${theme.shape.borderRadius}px`,
        backgroundColor: alpha(theme.palette.warning.light, 0.15),
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minHeight: "2.5rem",
          padding: "1rem 0.5rem",
        }}
      >
        <WarningAmberIcon
          aria-hidden
          sx={{
            flexShrink: 0,
            fontSize: "1rem",
            color: theme.palette.warning.light,
          }}
        />
        <Typography
          title={layerName}
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
          {layerName}
        </Typography>
        <Button
          variant="contained"
          color="error"
          disableElevation
          onClick={() => void confirm()}
          disabled={deleting}
          sx={buttonSx}
        >
          Delete
        </Button>
        <Button
          ref={cancelRef}
          variant="outlined"
          onClick={onCancel}
          disabled={deleting}
          sx={{
            ...buttonSx,
            color: theme.palette.text.primary,
            borderColor: theme.palette.text.secondary,
            backgroundColor: theme.palette.common.white,
            "&:hover": {
              borderColor: theme.palette.text.primary,
              backgroundColor: theme.palette.grey[50],
            },
          }}
        >
          Cancel
        </Button>
      </Box>
      {failed && (
        <Typography
          role="alert"
          sx={{
            padding: "0 0.5rem 0.375rem",
            fontSize: theme.typography.caption.fontSize,
            color: theme.palette.error.main,
          }}
        >
          Couldn’t delete this layer. Try again.
        </Typography>
      )}
    </Box>
  );
}
