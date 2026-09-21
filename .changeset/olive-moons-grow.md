---
"@bcgov/epic-map": minor
---

Group Favourites into folders. "New folder" is no longer a placeholder: it opens
a folder at the top of Favourites with its name pre-selected, and the folder is
local until the name is committed — Escape discards it without ever reaching the
API, so cancelling leaves nothing to clean up. A blank name falls back to
"Untitled folder" rather than being refused, because the field commits on blur
and an empty one is the user moving on.

Folders collapse and expand from a focusable chevron, and the state is stored
against the user rather than held in the component, so the panel reopens the way
it was left. The kebab renames a folder or ungroups it: ungrouping removes the
folder but is never destructive to what is starred — the layers come back out
to the top level. An open folder closes with a rule inset to the folder's own
width, separating it from the next folder or from the ungrouped favourites below.

Favourites and folders are two calls, so they can disagree. A layer whose
folder has not arrived — or never will, because the folders call failed — is
shown at the top level rather than left out, and a failed folders call says so
above the list instead of looking like folders that were deleted. A folder
change the API refuses says so too rather than quietly undoing itself, and
"New folder" stops at the 50-folder cap.

A favourited layer is dragged between the top level and a folder with native
HTML5 drag and drop, so the package still ships no drag dependency to its hosts.
The whole row is the drag surface and a 6-dot grip fades in on hover to say so.
A row in hand lifts off the panel, and the container under it shows a rule where
the layer will land rather than tinting itself. The grip is a Favourites
affordance only: a catalogue result belongs to no list, so it stays undraggable. A layer is in exactly one folder at a time, which the
API enforces with a single column.

Folder reordering is not here — that is its own ticket — and neither is the
"Move to folder" keyboard alternative, which is specced on its own.
