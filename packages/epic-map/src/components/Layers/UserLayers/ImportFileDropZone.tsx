import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Box, Button, Typography } from "@mui/material";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import {
  IMPORT_ACCEPT,
  IMPORT_FORMATS_LABEL,
  triageImportFiles,
} from "@/components/Layers/UserLayers/importUtils";
import { MAX_IMPORT_FILE_MB } from "@/utils/config";

/** A drag carrying files, rather than a favourite row being moved about. */
const isFileDrag = (dataTransfer: DataTransfer | null): boolean =>
  dataTransfer?.types.includes("Files") ?? false;

/**
 * Where a KML, GeoJSON or zipped shapefile enters the map: a drop target, and
 * a Browse button for everyone not dragging.
 *
 * One file at a time, because each one opens a dialog of its own.
 */
export default function ImportFileDropZone({
  onFileAccepted,
}: {
  onFileAccepted: (file: File) => void;
}) {
  const theme = useTheme();

  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const depth = useRef(0);

  const clear = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  // Fires however the drag ended, including outside the widget.
  useEffect(() => {
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, [clear]);

  const take = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      if (files.length > 1) {
        setProblems(["Import one file at a time."]);
        return;
      }

      const { accepted, rejected } = triageImportFiles([...files]);
      setProblems(rejected.map(({ name, reason }) => `${name}: ${reason}`));
      if (accepted[0]) onFileAccepted(accepted[0]);
    },
    [onFileAccepted],
  );

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    // A drop needs BOTH dragenter and dragover prevented: Chrome takes it with
    // dragover alone, Firefox and Safari do not.
    event.preventDefault();
    event.stopPropagation();
    depth.current += 1;
    setOver(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    // Otherwise the browser navigates away to show the dropped file.
    event.preventDefault();
    event.stopPropagation();
    clear();
    take(event.dataTransfer.files);
  };

  return (
    <Box sx={{ padding: "0 1rem" }}>
      <Typography
        component="h3"
        id="epic-map-import-file"
        sx={{
          margin: "0.5rem 0 0.375rem",
          fontSize: theme.typography.caption.fontSize,
          fontWeight: theme.typography.fontWeightBold,
          color: theme.palette.text.primary,
        }}
      >
        Import File
      </Typography>

      <Box
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          padding: "1.25rem 0.75rem",
          borderRadius: `${theme.shape.borderRadius}px`,
          border: `1px dashed ${
            over ? theme.palette.primary.main : theme.palette.divider
          }`,
          backgroundColor: over
            ? alpha(theme.palette.primary.main, 0.04)
            : theme.palette.grey[50],
          transition: theme.transitions.create([
            "border-color",
            "background-color",
          ]),
        }}
      >
        <FileUploadOutlinedIcon
          aria-hidden
          sx={{ fontSize: "1.5rem", color: theme.palette.text.secondary }}
        />
        <Typography
          sx={{
            fontSize: theme.typography.body2.fontSize,
            color: theme.palette.text.primary,
          }}
        >
          Drop files here or
        </Typography>
        <Button
          onClick={() => inputRef.current?.click()}
          aria-describedby="epic-map-import-file"
          sx={{
            height: "2rem",
            padding: "0 0.875rem",
            borderRadius: `${theme.shape.borderRadius}px`,
            backgroundColor: theme.palette.common.white,
            border: `1px solid ${theme.palette.divider}`,
            color: theme.palette.text.primary,
            fontSize: theme.typography.body2.fontSize,
            fontWeight: theme.typography.fontWeightMedium,
            "&:hover": {
              backgroundColor: theme.palette.common.white,
              borderColor: theme.palette.grey[500],
            },
          }}
        >
          Browse files
        </Button>
        <Typography
          sx={{
            textAlign: "center",
            fontSize: theme.typography.caption.fontSize,
            lineHeight: 1.5,
            color: theme.palette.text.disabled,
          }}
        >
          Accepts: {IMPORT_FORMATS_LABEL}
        </Typography>

        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          hidden
          onChange={(event) => {
            take(event.target.files);
            // Cleared so picking the same file again still fires a change.
            event.target.value = "";
          }}
        />
      </Box>

      <Typography
        sx={{
          margin: "0.5rem 0",
          fontSize: theme.typography.caption.fontSize,
          color: theme.palette.text.disabled,
        }}
      >
        Max file size: {MAX_IMPORT_FILE_MB} MB
      </Typography>

      <Box aria-live="polite">
        {problems.map((problem) => (
          <Typography
            key={problem}
            sx={{
              marginBottom: "0.25rem",
              fontSize: theme.typography.caption.fontSize,
              lineHeight: 1.5,
              color: theme.palette.error.main,
            }}
          >
            {problem}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
