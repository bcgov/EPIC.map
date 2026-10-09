---
"@bcgov/epic-map": minor
---

Search the map from the bar above it. One field, two kinds of result in a
single dropdown: EAO projects matched against the project list, and places
matched against the BC Address Geocoder. Each group is headed and only appears
when it has matches; choosing a row flies the map to it and drops a marker.

Projects are matched in the browser against the list the filter bar already
holds, so they appear on the keystroke, while places are debounced and arrive a
moment later — which is why the two states overlap rather than replace each
other: project matches are listed above the "Searching" row while the geocoder
is still answering. The no-results message waits for the search to settle, so it
never announces nothing found over a request still in flight, and the menu stays
shut below two characters rather than reporting on a place search that has not
run.

Projects are searched over the whole list rather than the filtered subset.
Search is how a user reaches something they cannot see, and a project hidden by
a filter they have forgotten is the case where being unable to find it is worst.
A chosen project is flown to Track's single coordinate for it; project markers
and host navigation are still their own ticket, and `GET /projects` does not
exist yet, so the Projects group renders empty until that lands.

Places come from `addresses.json`, which carries everything each row shows — no
second call. A row is titled with the most specific thing the feature names: a
civic address, else a street, else the locality. The pill takes `localityType`
verbatim, whatever it says, because the full set is defined by BC's geographic
naming and is not ours to allow-list; `matchPrecision` is the fallback for
address-level hits that carry no locality type. A feature that classifies itself
as nothing gets no pill rather than one reading "Unknown" — which the service
sends as a literal word rather than an empty string, and sends often. The
locality is shown beside the pill only for a row titled with a street, since a
bare locality's title already is its name.

Results are passed through as the geocoder ranks them, without deduplication or
a score floor. Two rows may agree on everything shown and still be different
places, and the four cities that come back for "1012 Douglas St" are the point
of the locality beside the pill rather than a fault to collapse.

The one thing dropped is the service's non-match. It has no empty response: a
query it cannot place comes back as a single feature that fell all the way back
to the province, so "tmo", "zzzzz" and anything else that matches nothing were
all being offered the same row, "BC Harbours Board Rwy, Surrey". Those are
recognised by their `PROVINCE` match precision rather than by a score floor,
which is a statement about what the service did rather than a guess at how good
the answer was, and needs no number anyone has to tune. Nothing legitimate is
lost — even a search for "British Columbia" comes back as streets.

How far the map flies is driven by `matchPrecision`, which is the geocoder's own
statement of how big the thing it found is: one zoom for every place would
either leave a municipality off the edges of the viewport or put a civic address
in the middle distance. The marker is a MapLibre `Marker` rather than a source
and layer, so unlike everything else this widget draws it survives a basemap
switch without being carried across.

The field is a combobox over the results listbox, so Up and Down move the active
row with focus never leaving what is being typed, Enter selects it and Escape
closes the menu without clearing the query. Choosing a row keeps the typed query
rather than replacing it with the result's name — the query is the user's, and
replacing it would make going back for one of the other matches a retype.

The map instance now lives in `MapWidget` rather than in `MapSurface`, which
reports it upward through `onMapReady`. The search field is in the bar above the
map surface and has to drive the camera, and the two were siblings.

`filterTokens.ts` grows the handful of values the search needed and is no longer
only the filter bar's — one list, because the controls sit side by side in the
same bar and have to agree on a border and a hover. Result rows hover
`#FAF9F8` rather than the `#ECEAE8` the ticket's prose gives, which is what the
Figma frames actually draw: the heavier grey that reads as one highlighted
option among six reads as a banded table down a list of 55px rows.

Component tests arrive with this, and with them `@testing-library/react`,
`@testing-library/user-event` and `jsdom` as dev dependencies. Grouping, the
overlapping states and the keyboard cannot be checked without rendering. The two
files that need a DOM ask for one with a `@vitest-environment` docblock, so the
rest of the suite stays on the node environment it has always used.
