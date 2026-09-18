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

