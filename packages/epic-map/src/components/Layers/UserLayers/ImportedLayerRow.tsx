import { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Slider,
  Switch,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import WarningIcon from "@mui/icons-material/Warning";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { useTheme } from "@mui/material/styles";
import { formatUploadedDate, type ImportedLayer } from "@/api/useImportedLayers";
import { sliderSx } from "@/components/Layers/LayerInfo";
import { focusRing, toggleSx } from "@/components/Layers/LayerRow";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  opacityOf,
  useImportedLayersContext,
} from "@/components/Layers/UserLayers/ImportedLayersContext";
import ImportFileDialog from "@/components/Layers/UserLayers/ImportFileDialog";
import ImportedLayerMenu from "@/components/Layers/UserLayers/ImportedLayerMenu";

/**
 * One imported layer in My Layers: on/off, name, zoom to it, its actions, and
 * the details that open under it.
 *
 * Laid out like a catalogue row, and expanded through the same shared state,
 * so opening this closes whichever row was open in any section.
 */
export default function ImportedLayerRow({ layer }: { layer: ImportedLayer }) {
  const theme = useTheme();
  const { expandedId, toggleExpanded } = useLayers();
  const {
    shownIds,
    opacities,
    toggleVisible,
    setOpacity,
    focusLayer,
    failedIds,
    retryFeatures,
    takenNames,
    updateLayer,
  } = useImportedLayersContext();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);

  const expanded = expandedId === layer.id;
  const visible = shownIds.has(layer.id);
  // Only while it is on: a layer switched off is not expected on the map.
  const failed = visible && failedIds.has(layer.id);
  const opacity = opacityOf(opacities, layer.id);
  const uploaded = formatUploadedDate(layer.uploadedAt);

  const infoId = `${layer.id}-info`;
  const menuId = `${layer.id}-menu`;
  const opacityLabelId = `${layer.id}-opacity`;

  const iconButtonSx = {
    flexShrink: 0,
    padding: "0.25rem",
    borderRadius: `${theme.shape.borderRadius}px`,
    color: theme.palette.text.primary,
    ...focusRing(theme),
  } as const;

  const captionSx = {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    marginTop: "0.125rem",
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 1.4,
  } as const;

  const labelSx = {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.4,
    color: theme.palette.text.disabled,
  };
  const valueSx = {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.4,
    color: theme.palette.text.primary,
    overflowWrap: "anywhere",
  } as const;

  /** Label and value share one grid, so every value starts on the same line. */
  const detail = (label: string, value: string) => (
    <>
      <Typography component="dt" sx={labelSx}>
        {label}
      </Typography>
      <Typography component="dd" sx={{ ...valueSx, margin: 0 }}>
        {value}
      </Typography>
    </>
  );

  return (
    <Box component="li" sx={{ listStyle: "none" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.25rem 1rem",
          borderRadius: `${theme.shape.borderRadius}px`,
          "&:hover": { backgroundColor: theme.palette.grey[50] },
        }}
      >
        <Switch
          checked={visible}
          onChange={() => toggleVisible(layer.id)}
          inputProps={{ "aria-label": `Show ${layer.name} on the map` }}
          sx={toggleSx(theme)}
        />

        {/* The name and the line under it are the row's own expand control. */}
        <Box
          component="button"
          type="button"
          onClick={() => toggleExpanded(layer.id)}
          aria-expanded={expanded}
          aria-controls={infoId}
          sx={{
            flexGrow: 1,
            minWidth: 0,
            padding: 0,
            border: "none",
            background: "none",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
            ...focusRing(theme),
          }}
        >
          <Typography
            component="span"
            title={layer.name}
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
              fontSize: theme.typography.body2.fontSize,
              lineHeight: 1.4,
              color: theme.palette.primary.dark,
            }}
          >
            {layer.name}
          </Typography>
          {layer.isSensitive ? (
            <Typography
              component="span"
              sx={{ ...captionSx, color: theme.palette.error.main }}
            >
              <WarningIcon aria-hidden sx={{ fontSize: "0.875rem" }} />
              Sensitive
            </Typography>
          ) : (
            uploaded && (
              <Typography
                component="span"
                sx={{ ...captionSx, color: theme.palette.text.secondary }}
              >
                Uploaded {uploaded}
              </Typography>
            )
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <IconButton
            size="small"
            onClick={() => focusLayer(layer)}
            disabled={!layer.extent}
            aria-label={`Zoom to ${layer.name}`}
            sx={iconButtonSx}
          >
            <ZoomInIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>

          <IconButton
            size="small"
            onClick={(event) => {
              const button = event.currentTarget;
              setMenuAnchor((current) => (current ? null : button));
            }}
            aria-label={`Actions for ${layer.name}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
            aria-controls={menuAnchor ? menuId : undefined}
            sx={{
              ...iconButtonSx,
              ...(menuAnchor && { backgroundColor: theme.palette.grey[50] }),
            }}
          >
            <MoreVertIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
          <ImportedLayerMenu
            id={menuId}
            layerName={layer.name}
            anchorEl={menuAnchor}
            onClose={() => setMenuAnchor(null)}
            onEdit={() => setEditing(true)}
          />

          <IconButton
            size="small"
            onClick={() => toggleExpanded(layer.id)}
            aria-expanded={expanded}
            aria-controls={infoId}
            aria-label={`Layer details for ${layer.name}`}
            sx={{
              ...iconButtonSx,
              transition: theme.transitions.create("transform"),
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: "1.25rem" }} />
          </IconButton>
        </Box>
      </Box>

      {failed && (
        <Box
          role="alert"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            // In line with the name, past the toggle.
            padding: "0 1rem 0.25rem 4rem",
          }}
        >
          <WarningAmberIcon
            aria-hidden
            sx={{ fontSize: "1rem", color: theme.palette.error.main }}
          />
          <Typography
            sx={{
              flexGrow: 1,
              fontSize: theme.typography.caption.fontSize,
              lineHeight: 1.4,
              color: theme.palette.error.main,
            }}
          >
            Couldn’t load this layer
          </Typography>
          <Button
            size="small"
            onClick={() => retryFeatures(layer.id)}
            aria-label={`Try loading ${layer.name} again`}
            sx={{
              flexShrink: 0,
              minWidth: 0,
              padding: "0 0.25rem",
              fontSize: theme.typography.caption.fontSize,
              fontWeight: theme.typography.fontWeightBold,
              textTransform: "none",
              ...focusRing(theme),
            }}
          >
            Try again
          </Button>
        </Box>
      )}

      {editing && (
        <ImportFileDialog
          layer={layer}
          existingNames={takenNames}
          onClose={() => setEditing(false)}
          onSave={(changes) => updateLayer(layer.id, changes)}
        />
      )}

      <Collapse in={expanded} id={infoId}>
        <Box sx={{ padding: "0.25rem 1rem" }}>
          <Box
            sx={{
              backgroundColor: theme.palette.grey[100],
              padding: "0.5rem 1rem",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <Typography component="span" id={opacityLabelId} sx={labelSx}>
                Opacity
              </Typography>
              <Typography
                component="span"
                sx={{ ...valueSx, fontWeight: theme.typography.fontWeightBold }}
              >
                {opacity}%
              </Typography>
            </Box>

            <Slider
              value={opacity}
              onChange={(_, value) => setOpacity(layer.id, value as number)}
              aria-labelledby={opacityLabelId}
              getAriaValueText={(value) => `${value} percent`}
              sx={sliderSx(theme)}
            />

            <Box
              component="dl"
              sx={{
                display: "grid",
                gridTemplateColumns: "5.5rem 1fr",
                columnGap: "0.5rem",
                rowGap: "0.25rem",
                margin: "0.375rem 0 0",
              }}
            >
              {detail("File name", layer.sourceFilename)}
              {layer.description && detail("Description", layer.description)}
              {uploaded && detail("Uploaded", uploaded)}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
