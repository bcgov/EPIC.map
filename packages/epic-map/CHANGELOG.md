# @bcgov/epic-map

The map is no longer published to a registry. It ships as a Module Federation
remote — an image built by `.github/workflows/widget-cd.yml` and deployed as
`map-widget`, which host applications load over HTTP at runtime. There is
therefore no version for a host to pin and no release for it to upgrade to: a
change here reaches every host on its users' next page load.

What a host *does* hold is a copy of the public contract,
`@bcgov/epic-map-types`, which has its own changelog. Nothing in this repository
is published, so both changelogs are kept by hand, newest first.

## Unreleased

### Converted to a Module Federation remote

Hosts no longer install `@bcgov/epic-map` and compile it in. The map is built as
a federated remote, served from its own origin, and fetched at runtime by
whichever application mounts it — which is what lets EPIC.centre and EPIC.submit
embed the same map as map-web without any of them rebuilding when it changes.

For a host, the change is: take a copy of `epic-map.d.ts` for the types — the
remote serves it, nothing is installed — point `VITE_MAP_WIDGET_URL` at the
remote, declare the shared modules in `federation.shared.mjs`, and load
`epicMap/MapWidget`. See the README.

The stylesheet import is gone. maplibre's CSS now travels inside the remote and
injects itself on load, so there is no `@bcgov/epic-map/styles.css` any more and
nothing for a host to import.

### Minor Changes

- Render a real MapLibre base map in the map surface.

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
  showing the basemap you are not looking at, which swaps the style without moving
  the camera. Sources and layers named with the widget's `epic-` prefix are
  carried onto the incoming style, so a switch will not take project data down
  with it.

  The standard basemap is **BC Basemap** - the provincial basemap recommended by
  the BC Gov GIS team, from the `bc-basemap` dataset in the BC Data Catalogue. It
  is a public ArcGIS Online vector tile service in EPSG:3857, needs no API key,
  and carries BC Sans and the Aboriginal Sans/Serif faces, so provincial
  typography and Indigenous place names render as the province publishes them.
  Satellite remains Esri World Imagery.

  New optional prop **`basemapStyles`** replaces the style URL behind either
  basemap. Both defaults are services this package does not own: BC Basemap is
  licensed "Access Only" and its URLs are published as subject to change, so a
  host needs to be able to point elsewhere without waiting for a release here. The
  switch's labels and thumbnails are not overridable - they describe the slot, not
  the service filling it.

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

- Persist enabled layers against map-api. Switching a layer on POSTs it to
  `/users/me/layers`, switching it off DELETEs it, and moving the opacity slider
  PATCHes it once the drag settles. The panel loads the stored list on mount and
  draws it, so a layer left on — at the opacity it was left at — is still on in
  the next session. The BC Data Catalogue section lists them under its search.

- Make "Zoom in to view" go to the layer, not just to a zoom level. Each enabled
  layer's row carries a button that flies the map to the feature of that layer
  nearest the current map centre, so a layer scattered across the province sends
  you to the part of it you were already looking at rather than zooming in on
  empty ground. A layer with nothing nearby falls back to its first feature.

  Draw each layer over the range of zooms it is actually published for. Every BCGW
  layer declares the coarsest scale its style draws at, and past that scale
  openmaps answers a tile request with a blank image rather than an error - so a
  layer gated on one shared zoom floor either vanished while the warehouse would
  still have drawn it, or was drawn where it could only ever come back empty. The
  limits are nothing alike: across the catalogue they run from 1:50,000 to
  1:12,000,000, which is zoom 13 down to zoom 5. Each layer now uses its own, and
  "Zoom in to view" flies to a zoom where that layer really appears.

  WMS tiles are requested at 512px rather than 256px. openmaps speaks HTTP/1.1, so
  the browser holds about six connections to it and the rest queue; a 512px tile
  covers four 256px tiles at the same resolution, which took a viewport of one
  layer from ~30 requests to ~12, measured at 1.13s against 0.43s.

  Needs two new map-api endpoints, because neither WFS feature geometry nor WMS
  GetCapabilities is readable from a browser - openmaps sends no
  `access-control-allow-origin` on either:
  `GET /catalogue/layers/{object_name}/nearest-feature` and
  `GET /catalogue/layers/{object_name}/min-zoom`.

  Draw a layer's own shapes while it is too far out to draw itself. An enabled
  layer below its published scale is outlined on the map in blue - not a box
  around where it is, but the real geometry, stroked and unfilled - so a user
  looking at the whole province can see the shape of what they have switched on.
  The scale limit that hides a layer is published in its *style* rather than in
  its data, so the outline is the same warehouse rendering the same features under
  a style of ours that declares no limit. Points are drawn as small circles;
  everything else is stroked as it is. Verified against openmaps: a request over
  the whole province comes back fully transparent under the published style and
  carries the layer's outlines under this one.

  The handoff is MapLibre's rather than the panel's - the outline's maxzoom is the
  layer's floor and the layer's own minzoom is the same number - so the outline
  gives way to the real layer on the frame the zoom crosses it, on the same tile
  grid, pixel for pixel.

  A layer whose published scale converts past the map's own maximum zoom no longer
  offers "Zoom in to view" - there is no zoom that reaches it, so the row says
  "Not visible at any zoom" instead of offering a button that cannot keep its
  word. Its shapes are still outlined, which is now the only way to see it at
  all.

  A press of "Zoom in to view" that fails now says so on the row rather than
  stopping the spinner and leaving the map where it was: a layer the warehouse
  publishes no features for is told apart from a warehouse that did not answer,
  and the second stays pressable because pressing again is what fixes it.

### Patch Changes

- Show the signed-in user on the map surface. The `name` and `preferred_username`
  claims are decoded from the token the host returns from `getAccessToken` — for
  display only, and no new prop is required.

- Show whether map-api trusts the host's token.

  The map surface now calls `GET /users/me` and reports the result beside the
  decoded claim, because the two say different things: a claim proves the host's
  token reached the widget, while a 200 from map-api proves the signature was
  checked against Keycloak's JWKS, the issuer, expiry and `azp` allowlist passed,
  and a map-db record was read. 401, 403 and an unreachable API are reported
  distinctly.

  No new props. This is the package's first call to map-api.

- Persist the Favourites list. Starring a layer in the BC Data Catalogue results
  now writes to `POST /users/me/favourites` and un-starring deletes it, so the
  list survives a reload and follows the user between browsers — previously it
  was React state that was lost when the widget unmounted.

  The star fills optimistically and rolls back if the call is refused, matching
  how the visibility switch already behaves. Favourites are newest first, and the
  section reports its own loading and error states with a retry, rather than
  showing an empty list when the call failed.

  Starring is independent of switching a layer on: a favourite is a bookmark, so
  it is not drawn on the map and carries no opacity. A dataset that publishes no
  mappable layer cannot be starred, because the API stores an object name.

  No new props. The "New folder" button remains a placeholder.

## 0.1.0

### Minor Changes

- Initial extraction of the EPIC map into a publishable React component.

  `MapWidget` takes its API base URL and its access token from the host through
  props, renders its own QueryClient, and inherits the host's MUI theme. It adds
  no router, no auth client and no theme of its own.
