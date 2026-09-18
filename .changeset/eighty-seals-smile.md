---
"@bcgov/epic-map": patch
---

Persist the Favourites list. Starring a layer in the BC Data Catalogue results
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
