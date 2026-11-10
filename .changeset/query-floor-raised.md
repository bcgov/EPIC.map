---
"@bcgov/epic-map": patch
---

Raise the shared @tanstack/react-query floor to ^5.102.0, the first release with
`queryClient.query`, which replaces the deprecated `fetchQuery`. A host that
copies federation.shared.mjs should take the new floor.
