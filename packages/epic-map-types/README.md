# @bcgov/epic-map-types

The public TypeScript contract for the EPIC map — `MapWidgetProps` and
everything it references. **Types only**: this package contains no JavaScript
and adds nothing to a host's bundle.

The map itself is not a dependency of anything. It is a
[Module Federation](https://module-federation.io) remote, loaded over HTTP at
runtime from whatever origin the host is configured with, so there is no import
for TypeScript to infer a type from. This file fills that gap.

## It is not published

There is no registry, no token and no `.npmrc`. `index.d.ts` reaches consumers
two ways, and the point of both is that neither is an install step:

**Inside this repository** — an npm workspace. `map-web` and `@bcgov/epic-map`
both depend on it as `"*"`; npm symlinks it from `packages/`. The widget's own
`src/types.ts` re-exports it, so removing a prop here fails the widget's
typecheck, in the same CI run.

**Outside this repository** — the widget's build copies this file into the
remote's output, so it is served at `/epic-map.d.ts` from every deployment
alongside the `remoteEntry.js` it describes. A host downloads it into its own
source tree and can re-check it whenever it likes:

```sh
curl -fsS https://map-widget-c8b80a-prod.apps.gold.devops.gov.bc.ca/epic-map.d.ts \
  -o src/types/epic-map-types.d.ts
```

The copy served is byte-identical to this one, so `diff` is the whole drift
check. See [the widget's README](../epic-map/README.md) for the CI step.

## Use

A host outside this repository points the package name at the file it vendored,
so the rest of the wiring is identical everywhere:

```jsonc
// tsconfig.json
"paths": {
  "@bcgov/epic-map-types": ["./src/types/epic-map-types.d.ts"]
}
```

The contract imports `geojson` and `react` types, so `@types/geojson` has to be
installed if it is not already.

Then declare the remote module once, anywhere in the host's `src`:

```ts
// src/types/epic-map.d.ts
declare module "epicMap/MapWidget" {
  export { MapWidget, default } from "@bcgov/epic-map-types";
}
```

`epicMap` is the alias the host registers the remote under; use whatever name
the host's Module Federation config uses. Then load it:

```tsx
import { lazy } from "react";

const MapWidget = lazy(() => import("epicMap/MapWidget"));
```

See `map-web/src/components/Map/MapWidgetRemote.tsx` in this repository for a
host that does the whole thing — runtime URL resolution, error boundary and
fallback included.

## Versioning

`version` in `package.json` tracks the map's public API, not its
implementation, and is bumped by hand along with `CHANGELOG.md` when a prop is
added or changed. Nothing enforces it and nothing resolves against it — it
exists so a vendored copy can be identified.

The contract may grow. **It must not shrink**: a host compiled against an older
copy keeps loading today's remote, and a prop that quietly stops being honoured
fails in that host's browser rather than in anyone's build.
