import type { DragEvent } from "react";

type LiftedStyle = {
  background: string;
  boxShadow: string;
  borderRadius: string;
};

/**
 * Give the drag its own picture of the row, lifted, rather than the browser's.
 *
 * The browser snapshots the source element as `dragstart` returns, so styling
 * applied after that is too late. A clone is styled up front and handed over.
 * It has to be in the document to be snapshotted, so it is parked off the top
 * edge and removed a tick later.
 */
export const setLiftedDragImage = (
  event: DragEvent<HTMLElement>,
  style: LiftedStyle,
): void => {
  const row = event.currentTarget;
  const { width, height, left, top } = row.getBoundingClientRect();
  const clone = row.cloneNode(true) as HTMLElement;

  clone.style.position = "fixed";
  // Just past the edge, not thousands of pixels: a browser need not paint what
  // is far outside the viewport, and an unpainted clone photographs blank.
  clone.style.top = `-${Math.ceil(height)}px`;
  clone.style.left = "0";
  // Class names come with the clone, so only the width has to be restated:
  // off in the margin there is no column to fill.
  clone.style.width = `${width}px`;
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  clone.style.opacity = "1";
  clone.style.background = style.background;
  clone.style.boxShadow = style.boxShadow;
  clone.style.borderRadius = style.borderRadius;

  // The grip only shows on hover, and a clone off the edge is not hovered.
  const grip = clone.querySelector<HTMLElement>(".epic-map-grip");
  if (grip) grip.style.opacity = "1";

  document.body.append(clone);
  // Offset by where the row was grabbed, so it stays under the pointer.
  event.dataTransfer.setDragImage(
    clone,
    event.clientX - left,
    event.clientY - top,
  );

  // The snapshot is taken after this handler returns.
  window.setTimeout(() => clone.remove(), 0);
};
