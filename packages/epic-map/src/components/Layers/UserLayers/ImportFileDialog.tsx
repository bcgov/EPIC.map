import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DoNotDisturbAltOutlinedIcon from "@mui/icons-material/DoNotDisturbAltOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { alpha, useTheme } from "@mui/material/styles";
import ImportPreviewMap, {
  MIN_PREVIEW_HEIGHT,
} from "@/components/Layers/UserLayers/ImportPreviewMap";
import {
  hasProblem,
  layerNameFromFile,
  parseImportFile,
  validateImportForm,
  type ImportFormProblems,
  type ParsedImport,
  type SensitiveChoice,
} from "@/components/Layers/UserLayers/importUtils";

/** Everything the user settled on, handed over when they upload. */
export type ImportDraft = {
  file: File;
  parsed: ParsedImport;
  name: string;
  description: string;
  sensitive: boolean;
};

const TITLE_ID = "epic-map-import-dialog-title";
const SENSITIVE_ID = "epic-map-import-sensitive";

/** Stands in for a figure the file has not given up, or never will. */
const UNKNOWN = "—";

const NO_PROBLEMS: ImportFormProblems = { name: null, sensitive: null };

/**
 * The file, read and previewed, with the details it will be saved under.
 *
 * Mounted per file, so the fields start from that file and nothing survives a
 * cancel.
 */
export default function ImportFileDialog({
  file,
  existingNames,
  onClose,
  onUpload,
}: {
  file: File;
  /** Names already taken, which a new layer may not repeat. */
  existingNames: readonly string[];
  onClose: () => void;
  onUpload: (draft: ImportDraft) => void;
}) {
  const theme = useTheme();

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sensitive, setSensitive] = useState<SensitiveChoice>("");
  const [problems, setProblems] = useState<ImportFormProblems>(NO_PROBLEMS);

  useEffect(() => {
    // Closing mid-read must leave nothing behind, and a file large enough to
    // take a moment is exactly when that happens.
    let live = true;

    parseImportFile(file)
      .then((result) => {
        if (!live) return;
        setParsed(result);
        // Only once the file is known to be importable: a name for a file the
        // map cannot read is a name for nothing.
        setName(layerNameFromFile(file.name));
      })
      .catch((cause: Error) => live && setFailure(cause.message));

    return () => {
      live = false;
    };
  }, [file]);

  const submit = () => {
    const found = validateImportForm(name, sensitive, existingNames);
    setProblems(found);
    if (!parsed || hasProblem(found)) return;

    onUpload({
      file,
      parsed,
      name: name.trim(),
      description: description.trim(),
      sensitive: sensitive === "yes",
    });
  };

  const fieldLabel = {
    display: "block",
    marginBottom: "0.25rem",
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
  } as const;

  /** Held to one height so the form does not move as the file is read. */
  const previewArea = {
    display: "flex",
    flex: "1 1 auto",
    minHeight: MIN_PREVIEW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  } as const;

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={TITLE_ID}
      maxWidth="md"
      fullWidth
      // As tall as the viewport allows, so the preview has room to be read.
      // MUI's own maxHeight - calc(100% - 64px) - keeps the standard margin
      // around it. PaperProps rather than slotProps: v5's Dialog forwards only
      // the modal's own slots and drops anything else, silently.
      PaperProps={{ sx: { height: "100%" } }}
    >
      <DialogTitle
        id={TITLE_ID}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1rem 1.5rem",
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontSize: theme.typography.h6.fontSize,
          fontWeight: theme.typography.fontWeightBold,
        }}
      >
        Import File
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem",
        }}
      >
        {parsed && (
          <ImportPreviewMap geojson={parsed.geojson} bounds={parsed.bounds} />
        )}

        {!parsed && !failure && (
          <Box sx={{ ...previewArea, gap: "0.75rem" }}>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: theme.typography.body2.fontSize }}>
              Reading {file.name}…
            </Typography>
          </Box>
        )}

        {failure && (
          <Box
            role="alert"
            sx={{
              ...previewArea,
              flexDirection: "column",
              gap: "0.5rem",
              padding: "1rem",
              textAlign: "center",
              borderRadius: `${theme.shape.borderRadius}px`,
              border: `1px dashed ${theme.palette.divider}`,
              backgroundColor: theme.palette.grey[50],
            }}
          >
            <DoNotDisturbAltOutlinedIcon
              aria-hidden
              sx={{ fontSize: "1.5rem", color: theme.palette.text.disabled }}
            />
            <Typography
              sx={{
                fontSize: theme.typography.body2.fontSize,
                color: theme.palette.text.primary,
              }}
            >
              This file could not be imported
            </Typography>
            <Typography
              sx={{
                fontSize: theme.typography.caption.fontSize,
                color: theme.palette.text.disabled,
              }}
            >
              {failure}
            </Typography>
          </Box>
        )}

        {/* The form keeps its natural height; the preview above takes whatever
            is left, and the dialog scrolls once the preview is at its floor. */}
        <Box sx={{ flexShrink: 0 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
              gap: "0.25rem 1.25rem",
              margin: "1rem 0 1.5rem",
              padding: "0.75rem 1rem",
              borderRadius: `${theme.shape.borderRadius}px`,
              backgroundColor: alpha(theme.palette.primary.main, 0.04),
            }}
          >
            {["Uploaded File", "File Type", "Geometry type", "Features"].map(
              (heading) => (
                <Typography
                  key={heading}
                  sx={{
                    fontSize: theme.typography.body2.fontSize,
                    fontWeight: theme.typography.fontWeightBold,
                    color: theme.palette.text.primary,
                  }}
                >
                  {heading}
                </Typography>
              ),
            )}
            {[
              file.name,
              parsed?.format ?? UNKNOWN,
              parsed?.geometryType ?? UNKNOWN,
              parsed ? String(parsed.featureCount) : UNKNOWN,
            ].map((value, index) => (
              <Typography
                key={value + index}
                sx={{
                  fontSize: theme.typography.body2.fontSize,
                  color: theme.palette.text.secondary,
                  overflowWrap: "anywhere",
                }}
              >
                {value}
              </Typography>
            ))}
          </Box>

          {parsed?.reprojectedFrom && (
            <Box
              sx={{
                display: "flex",
                gap: "0.625rem",
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: `${theme.shape.borderRadius}px`,
                border: `1px solid ${theme.palette.warning.main}`,
                backgroundColor: alpha(theme.palette.warning.main, 0.08),
              }}
            >
              <WarningAmberIcon
                aria-hidden
                sx={{
                  flexShrink: 0,
                  fontSize: "1.125rem",
                  color: theme.palette.warning.dark,
                }}
              />
              <Typography
                sx={{
                  fontSize: theme.typography.body2.fontSize,
                  lineHeight: 1.5,
                  color: theme.palette.text.primary,
                }}
              >
                <Box
                  component="span"
                  sx={{ fontWeight: theme.typography.fontWeightBold }}
                >
                  Check this layer before uploading.
                </Box>{" "}
                The coordinates were converted from {parsed.reprojectedFrom} to
                WGS 84 to preview them here.
              </Typography>
            </Box>
          )}

          <Box sx={{ marginBottom: "1rem" }}>
            <Typography
              component="label"
              htmlFor="epic-map-import-name"
              sx={fieldLabel}
            >
              Layer Name
            </Typography>
            <TextField
              id="epic-map-import-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProblems((current) => ({ ...current, name: null }));
              }}
              error={problems.name !== null}
              helperText={problems.name ?? undefined}
              fullWidth
              size="small"
              required
              sx={{ marginBottom: 0 }}
              InputProps={{
                endAdornment: problems.name && (
                  <WarningAmberIcon
                    aria-hidden
                    sx={{
                      fontSize: "1.125rem",
                      color: theme.palette.error.main,
                    }}
                  />
                ),
              }}
            />
          </Box>

          <Box sx={{ marginBottom: "1.25rem" }}>
            <Typography
              component="label"
              htmlFor="epic-map-import-description"
              sx={fieldLabel}
            >
              Description
            </Typography>
            <TextField
              id="epic-map-import-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              size="small"
              multiline
              minRows={3}
              sx={{
                marginBottom: 0,
                "& .MuiInputBase-root.MuiInputBase-sizeSmall.MuiInputBase-multiline":
                  { height: "auto", alignItems: "flex-start" },
              }}
            />
          </Box>

          <Typography
            id={SENSITIVE_ID}
            sx={{
              fontSize: theme.typography.body2.fontSize,
              fontWeight: theme.typography.fontWeightBold,
              color: theme.palette.text.primary,
            }}
          >
            Does this layer contain sensitive information?
          </Typography>
          <RadioGroup
            aria-labelledby={SENSITIVE_ID}
            aria-describedby={
              problems.sensitive ? `${SENSITIVE_ID}-error` : undefined
            }
            value={sensitive}
            onChange={(event) => {
              setSensitive(event.target.value as SensitiveChoice);
              setProblems((current) => ({ ...current, sensitive: null }));
            }}
          >
            {[
              ["yes", "Yes, it contains sensitive information"],
              ["no", "No, it does not"],
            ].map(([value, label]) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio size="small" />}
                label={label}
                slotProps={{
                  typography: { fontSize: theme.typography.body2.fontSize },
                }}
              />
            ))}
          </RadioGroup>
          {problems.sensitive && (
            <Box
              id={`${SENSITIVE_ID}-error`}
              sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <WarningAmberIcon
                aria-hidden
                sx={{ fontSize: "1rem", color: theme.palette.error.main }}
              />
              <Typography
                sx={{
                  fontSize: theme.typography.caption.fontSize,
                  color: theme.palette.error.main,
                }}
              >
                {problems.sensitive}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          gap: "0.5rem",
          padding: "1rem 1.5rem",
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Button
          onClick={onClose}
          color="inherit"
          sx={{ color: theme.palette.text.secondary }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          // Only the file blocks the button; what is wrong with the form is
          // said on the form, where it can be fixed.
          disabled={!parsed}
          onClick={submit}
          sx={{ minWidth: "7rem" }}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}
