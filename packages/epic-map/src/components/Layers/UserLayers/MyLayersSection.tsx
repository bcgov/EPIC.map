import { useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import ErrorNotice from "@/components/Layers/ErrorNotice";
import LayersSection from "@/components/Layers/LayersSection";
import ImportedLayerRow from "@/components/Layers/UserLayers/ImportedLayerRow";
import { useImportedLayersContext } from "@/components/Layers/UserLayers/ImportedLayersContext";
import ImportFileDialog from "@/components/Layers/UserLayers/ImportFileDialog";
import ImportFileDropZone from "@/components/Layers/UserLayers/ImportFileDropZone";
import UploadProgressRow from "@/components/Layers/UserLayers/UploadProgressRow";

/**
 * Layers the user imports themselves.
 *
 * The layers map-api hosts are not here: they reach the panel as favourites
 * map-api puts in every user's list, so Favourites is where they are switched
 * on and organised.
 */
export default function MyLayersSection() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  /** The file being imported, which is what holds the dialog open. */
  const [importing, setImporting] = useState<File | null>(null);

  const {
    layers,
    pending,
    error,
    retry,
    uploads,
    takenNames,
    startUpload,
    cancelUpload,
    retryUpload,
    dismissUpload,
  } = useImportedLayersContext();

  const caption = {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
  } as const;

  const content = () => {
    if (pending)
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0 1rem 0.5rem",
          }}
        >
          <CircularProgress size={14} />
          <Typography sx={caption}>Loading your layers…</Typography>
        </Box>
      );

    if (error)
      return (
        <ErrorNotice
          message="Couldn’t load your layers"
          action="Try again"
          onAction={retry}
        />
      );

    if (layers.length > 0)
      return (
        <Box component="ul" sx={{ margin: 0, padding: 0, listStyle: "none" }}>
          {layers.map((layer) => (
            <ImportedLayerRow key={layer.id} layer={layer} />
          ))}
        </Box>
      );

    // An upload on its way is the answer to "nothing here yet".
    if (uploads.length > 0) return null;

    return (
      <DashedEmptyState>
        You do not have any imported layers yet.
      </DashedEmptyState>
    );
  };

  return (
    <LayersSection
      id="epic-map-my-layers"
      title="My Layers"
      count={layers.length}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      // Outside the collapsible body, so collapsing the section never hides
      // an upload's progress.
      pinned={
        uploads.length > 0 && (
          <Box>
            {uploads.map((upload) => (
              <UploadProgressRow
                key={upload.id}
                upload={upload}
                onCancel={() => cancelUpload(upload.id)}
                onRetry={() => retryUpload(upload.id)}
                onDismiss={() => dismissUpload(upload.id)}
              />
            ))}
          </Box>
        )
      }
    >
      {content()}
      <ImportFileDropZone onFileAccepted={setImporting} />

      {importing && (
        <ImportFileDialog
          // Keyed so a second file starts from its own name rather than the
          // one the last dialog was left on.
          key={`${importing.name}:${importing.lastModified}`}
          file={importing}
          existingNames={takenNames}
          onClose={() => setImporting(null)}
          onUpload={(draft) => {
            setImporting(null);
            startUpload(draft);
          }}
        />
      )}
    </LayersSection>
  );
}
