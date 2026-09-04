---
"@bcgov/epic-map": patch
---

Show the signed-in user on the map surface. The `name` and `preferred_username`
claims are decoded from the token the host returns from `getAccessToken` — for
display only, and no new prop is required.
