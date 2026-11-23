---
"@bcgov/epic-map": patch
---

The Layers panel holds its width inside a host with no `box-sizing` reset. Its
padded full-width rows were wider than the panel there, which clipped the
Favourites "New folder" button and added a horizontal scrollbar. The panel now
never scrolls sideways, and a section title truncates before its header action
gives way.
