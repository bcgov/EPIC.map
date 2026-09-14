import { useState } from "react";
import DashedEmptyState from "@/components/Layers/DashedEmptyState";
import LayersSection from "@/components/Layers/LayersSection";

/**
 * Layers the user imports themselves.
 */
export default function MyLayersSection() {
  const [expanded, setExpanded] = useState(true);

  return (
    <LayersSection
      id="epic-map-layers-mine"
      title="My Layers"
      count={0}
      expanded={expanded}
      onToggle={() => setExpanded((isExpanded) => !isExpanded)}
      divider={false}
    >
      <DashedEmptyState>
        You do not have any imported layers yet.
      </DashedEmptyState>
    </LayersSection>
  );
}
