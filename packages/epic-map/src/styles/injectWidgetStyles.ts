// maplibre's stylesheet, carried inside the remote's JavaScript.
//
// As an npm package this was a file the host imported. A federated remote has no
// such moment: the host never resolves anything of ours through its bundler, and
// a `<link>` to the remote's origin would be a second round trip that has to
// land before the map paints, on an origin the host's CSP may not list.
//
// So the CSS travels with the module that needs it. `?inline` hands us the
// processed text instead of emitting a file, and it goes into the document the
// first time the remote is loaded. ~40kB, once, gzipped over the wire with the
// chunk it rides in.
//
// This is the widget's ONLY stylesheet - everything else is MUI's `sx`, which
// emotion injects from the host's own cache. If a second one is ever added, add
// it here rather than asking hosts to import anything.
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css?inline";

const STYLE_ID = "epic-map-widget-styles";

/**
 * Idempotent on purpose. A host may load the remote more than once - two routes
 * mounting the map, a remount after an error boundary resets - and each of those
 * re-evaluates this module only if the chunk was evicted, which is not something
 * we get to rely on either way.
 */
const injectWidgetStyles = (): void => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = maplibreCss;
  // Prepended so the host's own stylesheets, and emotion's runtime-injected
  // rules, still win on equal specificity.
  document.head.prepend(style);
};

injectWidgetStyles();
