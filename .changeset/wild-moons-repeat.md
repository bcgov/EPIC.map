---
"@bcgov/epic-map": minor
---

Render a real MapLibre base map in the map surface.

The placeholder is gone. `MapSurface` now builds a `maplibre-gl` map with the
prototype's basemap (OpenFreeMap positron) and its controls: navigation without
a compass and single-shot geolocate bottom-right, a metric scale bar
bottom-left. Rotation stays off, and the WebGL buffer is preserved so a PNG
export of the canvas is possible later.

The default view is the whole of British Columbia, fitted to whatever box the
host gives the widget. It is an extent rather than the prototype's fixed
center/zoom because a fixed zoom shows a different amount of the province in a
full-page host than in a sidebar. `initialExtent` overrides it: pass one and the
map opens fitted there instead.

The prototype's basemap switch comes across with it: a card by the zoom controls
showing the basemap you are not looking at - standard (OpenFreeMap positron) or
satellite (Esri World Imagery) - which swaps the style without moving the
camera. Sources and layers named with the widget's `epic-` prefix are carried
onto the incoming style, so a switch will not take project data down with it.

The numbers and URLs the map is built from now live in `src/config.ts` rather
than at the top of the component.

Hosts must keep maplibre's web worker reachable from their bundle - maplibre 6
resolves it as a sibling of its own module, which neither Vite's dependency
optimizer nor a rollup build preserves. A worker that fails to load renders an
empty canvas with working controls and no error, so the README now documents the
symptom and the fix.

The token-verification and signed-in-user readouts the placeholder displayed are
removed - they were scaffolding for an empty surface. `useCurrentUser` and
`useHostIdentity` are unchanged and still available to whatever renders that
information next.
