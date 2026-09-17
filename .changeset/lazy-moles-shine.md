---
"@bcgov/epic-map": minor
---

Make "Zoom in to view" go to the layer, not just to a zoom level. Each enabled
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
