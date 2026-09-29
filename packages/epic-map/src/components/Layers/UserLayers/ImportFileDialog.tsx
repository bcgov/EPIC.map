import { useEffect, useState } from "react";
import axios from "axios";
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
import {
  useImportedFeatures,
  type ImportedLayer,
  type ImportedLayerChanges,
} from "@/api/useImportedLayers";
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

const NO_PROBLEMS: ImportFormProblems = {
  name: null,
  description: null,
  sensitive: null,
};

/** A new file, read here and uploaded by the caller. */
type ImportProps = { file: File; onUpload: (draft: ImportDraft) => void };
/** A stored layer, whose details are saved by the caller. */
type EditProps = {
  layer: ImportedLayer;
  onSave: (changes: ImportedLayerChanges) => Promise<void>;
};

/**
 * The file, read and previewed, with the details it will be saved under - or
 * a stored layer, previewed, with the details to change.
 *
 * Mounted per file or edit, so the fields start from that file or layer and
 * nothing survives a cancel.
 */
export default function ImportFileDialog(
  props: {
    /** Names already taken, which the layer may not repeat. */
    existingNames: readonly string[];
    onClose: () => void;
  } & (ImportProps | EditProps),
) {
  const { existingNames, onClose } = props;
  const file = "file" in props ? props.file : null;
  const layer = "layer" in props ? props.layer : null;
  const theme = useTheme();

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [parseFailure, setParseFailure] = useState<string | null>(null);
  // Shared with the map, so a layer already switched on is not fetched again.
  const features = useImportedFeatures(layer?.id ?? null);

  const [name, setName] = useState(layer?.name ?? "");
  const [description, setDescription] = useState(layer?.description ?? "");
  const [sensitive, setSensitive] = useState<SensitiveChoice>(
    layer ? (layer.isSensitive ? "yes" : "no") : "",
  );
  const [problems, setProblems] = useState<ImportFormProblems>(NO_PROBLEMS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
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
      .catch((cause: Error) => live && setParseFailure(cause.message));

    return () => {
      live = false;
    };
  }, [file]);

  const preview = layer
    ? features.data && { geojson: features.data, bounds: layer.extent }
    : parsed;
  const failure = layer
    ? features.isError
      ? "Its features could not be loaded."
      : null
    : parseFailure;

  const save = async (
    changes: ImportedLayerChanges,
    onSave: EditProps["onSave"],
  ) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(changes);
      onClose();
    } catch (error) {
      setSaving(false);
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const message = (response?.data as { message?: unknown } | undefined)
        ?.message;
      // Taken since the list was last fetched: said on the field, as the
      // check on submit would have.
      if (response?.status === 409 && typeof message === "string")
        setProblems((current) => ({ ...current, name: message }));
      else setSaveError("Your changes could not be saved. Try again.");
    }
  };

  const submit = () => {
    // A layer's own name is not a duplicate of itself.
    const others = layer
      ? existingNames.filter((taken) => taken !== layer.name)
      : existingNames;
    const found = validateImportForm({ name, description, sensitive }, others);
    setProblems(found);
    if (hasProblem(found)) return;

    if ("onSave" in props) {
      const changes = {
        name: name.trim(),
        description: description.trim() || null,
        isSensitive: sensitive === "yes",
      };
      if (
        changes.name === props.layer.name &&
        changes.description === props.layer.description &&
        changes.isSensitive === props.layer.isSensitive
      )
        onClose();
      else void save(changes, props.onSave);
      return;
    }

    if (!parsed) return;
    props.onUpload({
      file: props.file,
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

  const summary = layer
    ? [
        layer.sourceFilename,
        layer.sourceFormat,
        layer.geometryType,
        String(layer.featureCount),
      ]
    : [
        file?.name ?? UNKNOWN,
        parsed?.format ?? UNKNOWN,
        parsed?.geometryType ?? UNKNOWN,
        parsed ? String(parsed.featureCount) : UNKNOWN,
      ];

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
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
        {layer ? "Edit Layer" : "Import File"}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          disabled={saving}
          size="small"
        >
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
        {preview && (
          <ImportPreviewMap geojson={preview.geojson} bounds={preview.bounds} />
        )}

        {!preview && !failure && (
          <Box sx={{ ...previewArea, gap: "0.75rem" }}>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: theme.typography.body2.fontSize }}>
              {layer ? `Loading ${layer.name}…` : `Reading ${file?.name}…`}
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
              {layer
                ? "This layer could not be previewed"
                : "This file could not be imported"}
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
            {summary.map((value, index) => (
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
              onChange={(event) => {
                setDescription(event.target.value);
                setProblems((current) => ({ ...current, description: null }));
              }}
              error={problems.description !== null}
              helperText={problems.description ?? undefined}
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

          {saveError && (
            <Typography
              role="alert"
              sx={{
                marginTop: "1rem",
                fontSize: theme.typography.body2.fontSize,
                color: theme.palette.error.main,
              }}
            >
              {saveError}
            </Typography>
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
          disabled={saving}
          color="inherit"
          sx={{ color: theme.palette.text.secondary }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          // Only the file blocks Upload; what is wrong with the form is said
          // on the form, where it can be fixed. An edit needs no preview.
          disabled={layer ? saving : !parsed}
          onClick={submit}
          startIcon={
            saving ? <CircularProgress size={14} color="inherit" /> : undefined
          }
          sx={{ minWidth: "7rem" }}
        >
          {layer ? "Save changes" : "Upload"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
