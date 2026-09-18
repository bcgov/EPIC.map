import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  droppedLayerId,
  isFavouriteDrag,
} from "@/components/Layers/Favourites/favouriteDrag";

/**
 * Makes an element somewhere a favourite can be dropped: a folder, or the
 * top-level list.
 *
 * Targets nest, so every handler stops propagation and the innermost wins.
 * Otherwise the list would take the drop after the folder had filed it.
 */
export const useFavouriteDropTarget = (
  onDropLayer: (layerId: string) => void,
) => {
  const [over, setOver] = useState(false);
  // Counted rather than compared against relatedTarget, which some browsers
  // report as null: moving onto a child fires dragleave on the parent.
  const depth = useRef(0);

  const clear = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  // Fires on the dragged row however the drag ended, so it reaches targets the
  // row never entered. Without it a stale count strands the drop line on screen.
  useEffect(() => {
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, [clear]);

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFavouriteDrag(event.dataTransfer)) return;
    // A drop needs BOTH dragenter and dragover prevented: Chrome takes it with
    // dragover alone, Firefox and Safari do not.
    event.preventDefault();
    event.stopPropagation();
    depth.current += 1;
    setOver(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFavouriteDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFavouriteDrag(event.dataTransfer)) return;
    event.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!isFavouriteDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      clear();
      const layerId = droppedLayerId(event.dataTransfer);
      if (layerId) onDropLayer(layerId);
    },
    [clear, onDropLayer],
  );

  return {
    over,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
};
