import { useEffect, useState } from "react";
import { Box, Switch, Typography } from "@mui/material";
import { useLocalLayerStyle } from "@/api/useLocalLayerStyle";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayersSection from "@/components/Layers/LayersSection";
import { useLayers } from "@/components/Layers/LayersContext";
import {
  hideLocalVectorLayer,
  showLocalVectorLayer,
} from "@/components/Layers/layerUtils";
import { localTileUrl } from "@/utils/config";
import { useMapWidget } from "@/widget/MapWidgetContext";

/**
 * The one layer map-api hosts itself so far.
 *
 * Hard-coded, and obviously so: it has no BC Data Catalogue record, so it
 * cannot come back from a catalogue search the way every other layer does, and
 * inventing a catalogue entry for it would settle questions this is here to
 * answer first.
 */
const PIP_OBJECT_NAME = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";
const PIP_LAYER_ID = "pip-consultation-areas";
const PIP_LABEL = "First Nations PIP Consultation Areas";

/**
 * Layers the user imports themselves.
 *
 * Deliberately outside the applied-layers machinery: this toggle is component
 * state and nothing is persisted, so turning the layer on does not go through
 * the catalogue's identifiers, its opacity or its favourites. That keeps the
 * question of how a hosted layer joins that list open, which is a decision for
 * when there is more than one of them.
 */
export default function MyLayersSection() {
  const [expanded, setExpanded] = useState(true);
  const [enabled, setEnabled] = useState(false);

  const { map } = useLayers();
  const { apiBaseUrl } = useMapWidget();
  const { data: style } = useLocalLayerStyle(enabled ? PIP_OBJECT_NAME : null);

  useEffect(() => {
    if (!map) return;

    if (!enabled) {
      hideLocalVectorLayer(map, PIP_LAYER_ID);
      return;
    }

    // Nothing to draw until the style arrives. Adding the source first and
    // painting later would show the layer in MapLibre's default blue, which is
    // worse than showing it a moment later.
    if (!style) return;

    showLocalVectorLayer(
      map,
      PIP_LAYER_ID,
      localTileUrl(apiBaseUrl, PIP_OBJECT_NAME),
      style,
    );
  }, [map, enabled, style, apiBaseUrl]);

  return (
    <LayersSection
      id="epic-map-layers-mine"
      title="My Layers"
      count={enabled ? 1 : 0}
      expanded={expanded}
      onToggle={() => setExpanded((isExpanded) => !isExpanded)}
      divider={false}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          py: 0.5,
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 0 }}>
          {PIP_LABEL}
        </Typography>
        <Switch
          size="small"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          inputProps={{ "aria-label": PIP_LABEL }}
        />
      </Box>
      <DashedEmptyState>
        You do not have any imported layers yet.
      </DashedEmptyState>
    </LayersSection>
  );
}
