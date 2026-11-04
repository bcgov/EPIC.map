---
"@bcgov/epic-map": patch
---

Keep the camera on BC. The map's centre can no longer be panned past a padded
box around the province (`CENTER_BOUNDS`, roughly −143,47 to −110,61), and
`MIN_ZOOM` (3) stays the only zoom-out limit, so the whole province still fits
on any screen shape. The basemap no longer repeats horizontally.
