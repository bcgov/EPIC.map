---
"@bcgov/epic-map": patch
---

Keep the camera on BC. The map can no longer be panned past a padded box
around the province (`MAX_BOUNDS`, roughly −143,47 to −110,61) or zoomed out
to continental scale: MapLibre stops zooming out once that box would no longer
fill the viewport, and `MIN_ZOOM` rises from 3 to 4 as the floor on a small
one. The basemap no longer repeats horizontally. The box is BC_EXTENT padded by
a few degrees so projects on the borders and offshore can still be framed.
