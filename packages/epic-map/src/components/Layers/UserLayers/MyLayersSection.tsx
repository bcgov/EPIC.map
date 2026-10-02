import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Switch,
  Typography,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useTheme } from "@mui/material/styles";
import { useLocalLayerStyle } from "@/api/useLocalLayerStyle";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  hideLocalVectorLayer,
  showLocalVectorLayer,
} from "@/components/Layers/layerUtils";
import ImportedLayerRow from "@/components/Layers/UserLayers/ImportedLayerRow";
import { useImportedLayersContext } from "@/components/Layers/UserLayers/ImportedLayersContext";
import ImportFileDialog from "@/components/Layers/UserLayers/ImportFileDialog";
import ImportFileDropZone from "@/components/Layers/UserLayers/ImportFileDropZone";
import UploadProgressRow from "@/components/Layers/UserLayers/UploadProgressRow";
import { localTileUrl } from "@/utils/config";
import { useMapWidget } from "@/widget/MapWidgetContext";

/**
 * The one layer map-api hosts itself so far.
 *
 * Hard-coded, and obviously so: it has no BC Data Catalogue record, so it
 * cannot come back from a catalogue search the way every other layer does, and
 * inventing a catalogue entry for it would settle questions this is here to
 * answer first.
 *
 * It sits in this section rather than its own because, from the person's side,
 * "My Layers" is where layers that did not come from a search live - whether
 * they imported them or we host them.
 */
const PIP_OBJECT_NAME = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";
const PIP_LAYER_ID = "pip-consultation-areas";
const PIP_LABEL = "First Nations PIP Consultation Areas";

/**
 * Layers the user imports themselves, and the layers this API hosts.
 */
export default function MyLayersSection() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  /** The file being imported, which is what holds the dialog open. */
  const [importing, setImporting] = useState<File | null>(null);
  const [hostedEnabled, setHostedEnabled] = useState(false);

  const { map } = useLayers();
  const { apiBaseUrl } = useMapWidget();
  const { data: hostedStyle } = useLocalLayerStyle(
    hostedEnabled ? PIP_OBJECT_NAME : null,
  );

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

  useEffect(() => {
    if (!map) return;

    if (!hostedEnabled) {
      hideLocalVectorLayer(map, PIP_LAYER_ID);
      return;
    }

    // Nothing to draw until the style arrives. Adding the source first and
    // painting later would show the layer in MapLibre's default blue, which is
    // worse than showing it a moment later.
    if (!hostedStyle) return;

    showLocalVectorLayer(
      map,
      PIP_LAYER_ID,
      localTileUrl(apiBaseUrl, PIP_OBJECT_NAME),
      hostedStyle,
    );
  }, [map, hostedEnabled, hostedStyle, apiBaseUrl]);

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
        <Box sx={{ padding: "0 1rem 0.5rem", textAlign: "center" }}>
          <Typography
            sx={{ ...caption, color: theme.palette.text.primary }}
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
            Couldn’t load your layers
          </Typography>
          <Button
            variant="text"
            color="secondary"
            onClick={retry}
            sx={{ fontSize: theme.typography.caption.fontSize }}
          >
            Try again
          </Button>
        </Box>
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
      count={layers.length + (hostedEnabled ? 1 : 0)}
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
      {/* Above the imported layers: it is always there, where they come and go. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          padding: "0 1rem 0.5rem",
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 0 }}>
          {PIP_LABEL}
        </Typography>
        <Switch
          size="small"
          checked={hostedEnabled}
          onChange={(event) => setHostedEnabled(event.target.checked)}
          inputProps={{ "aria-label": PIP_LABEL }}
        />
      </Box>

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
