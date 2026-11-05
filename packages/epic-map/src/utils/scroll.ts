const scrolls = (element: Element) => {
  const { overflowY } = getComputedStyle(element);
  return overflowY === "auto" || overflowY === "scroll";
};

/**
 * Scrolls the element's nearest scrolling ancestor just far enough to show it.
 * Not scrollIntoView: that scrolls every ancestor, and the widget must not move
 * the host page it is embedded in.
 */
export const scrollIntoNearestView = (element: HTMLElement | null) => {
  let container = element?.parentElement ?? null;
  while (container && !scrolls(container)) container = container.parentElement;
  if (!element || !container) return;

  const { top, bottom } = element.getBoundingClientRect();
  const view = container.getBoundingClientRect();
  if (top < view.top) {
    container.scrollTop -= view.top - top;
  } else if (bottom > view.bottom) {
    // A row taller than the view shows its top.
    container.scrollTop += Math.min(bottom - view.bottom, top - view.top);
  }
};
