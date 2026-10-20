---
"@bcgov/epic-map": minor
---

Filter the map's projects from the bar above it. Type and Region are
multi-select dropdowns, and Certificate issued and In-progress works are on/off
toggles; the map updates on each change rather than behind an Apply button, and
a "Clear filters" link appears beside the toggles while anything is narrowing.

The counts in the dropdowns are faceted: each one is what that option would
actually yield given everything else already filtering, recomputed while the
menu is open, so ticking one box moves the numbers beside the others. An option
worth nothing is dimmed and shows its 0 rather than being hidden or disabled —
no filter is ever disabled, because a control the user cannot turn off is a
dead end. The "All ..." row counts what it delivers rather than every project
passing the other filters, which are not the same number once a project has no
type or no region: selecting every option excludes those, so counting them
would print a total the row does not produce when pressed.

A combination matching nothing is explained once, over the map, instead of as a
state on each of the four controls — any empty combination is the same
situation to the user, and dimming four controls leaves them to work out which
one did it. The message fades in beside the Layers button, carries its own
"Clear filters" shortcut, and is announced politely; the bar's link stays.

Projects are read from `GET /projects` and the dropdown options from `GET
/projects/filter-options`. The dropdowns are built from the Type and Region
code tables those endpoints return rather than from the values present in the
data, which is what lets an option with no projects still be offered, dimmed at
0. An option the menus do not offer — a project carrying a type or region
retired since the tables were cached — is left out of the counts, so the "All"
row never promises projects that selecting every option cannot reach.

A project list that cannot be loaded says so over the map, with a retry, rather
than leaving an empty province unexplained.
