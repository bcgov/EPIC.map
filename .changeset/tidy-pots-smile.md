---
"@bcgov/epic-map": minor
---

Persist enabled layers against map-api. Switching a layer on POSTs it to
`/users/me/layers`, switching it off DELETEs it, and moving the opacity slider
PATCHes it once the drag settles. The panel loads the stored list on mount and
draws it, so a layer left on — at the opacity it was left at — is still on in
the next session. The BC Data Catalogue section lists them under its search.
