# The EPIC map

The EPIC map as a **Module Federation remote**: a deployed service that host
applications load over HTTP at runtime, rather than a package they install and
compile in. Point your application at it, render `MapWidget`, and keep your own
routing, your own session and your own theme.

> **Status: pre-1.0.** The props below are stable and enforced. The map surface
> renders a MapLibre base map with the standard navigation, geolocate and scale
> controls; project layers, the details panel and the identify tools are still
> moving across from the prototype.

## Why a remote and not a package

The map is embedded by several applications that release on their own schedules —
map-web today, EPIC.centre and EPIC.submit next. As an npm package, shipping a
map change meant every one of them bumping a version, rebuilding and redeploying,
and until they all did there were several different maps in production.

As a remote, the map is deployed once and every host picks it up on its users'
next page load. Nothing is pinned, nothing is rebuilt, and there is exactly one
map in each environment.

What a host gives up for that is build-time certainty. The map is a network
dependency now, so it can be down, and the two sides agree on React and MUI at
load time rather than at compile time. Both of those have a specific answer
below — an error boundary for the first, the `shared` contract for the second.

- [Adding the map to a host](#adding-the-map-to-a-host)
- [Shared modules](#shared-modules)
- [Styles](#styles)
- [The maplibre web worker](#the-maplibre-web-worker)
- [Basemaps](#basemaps)
- [Getting access in Keycloak](#getting-access-in-keycloak)
- [What the widget does not do](#what-the-widget-does-not-do)
- [Props](#props)
- [Versioning](#versioning)
- [Types for a host outside this repository](#types-for-a-host-outside-this-repository)
- [Deployment](#deployment)
- [Source layout](#source-layout)
- [Working on the map](#working-on-the-map)

## Adding the map to a host

Four steps. `map-web` in this repository does all four and is the worked example —
copy from it.

**1. Install the tooling and take a copy of the contract.** Nothing about the
map is installed — see [Types for a host outside this repository](#types-for-a-host-outside-this-repository)
for the whole of it, which is one `curl`:

```bash
npm install --save-dev @module-federation/vite
npm install @module-federation/runtime
npm install --save-dev @types/geojson   # if you do not already have it

curl -fsS https://map-widget-c8b80a-prod.apps.gold.devops.gov.bc.ca/epic-map.d.ts \
  -o src/types/epic-map-types.d.ts
```

```jsonc
// tsconfig.json — so the declaration in step 4 reads the same as ours
"paths": {
  "@bcgov/epic-map-types": ["./src/types/epic-map-types.d.ts"]
}
```

**2. Declare the remote** in your Vite config, and copy
[`federation.shared.mjs`](federation.shared.mjs) into your repository unchanged:

```ts
import { federation } from "@module-federation/vite";
import { sharedModules } from "./federation.shared.mjs";

federation({
  name: "yourApp",
  remotes: {
    epicMap: {
      type: "module",
      name: "epicMap",
      // Only the default — see step 3.
      entry: "http://127.0.0.1:5174/remoteEntry.js",
    },
  },
  shared: sharedModules,
  runtimePlugins: ["./src/federation/remoteEntryUrl.ts"],
  dts: false,
})
```

Module Federation's generated entry uses top-level await, so `build.target` has to
be `chrome89` or later.

**3. Resolve the URL at runtime, not at build time.** Your application is built
once and promoted through dev, test and prod, each of which runs its own map. A
build-time URL would mean three images, and the one you tested would not be the
one that ships. A federation runtime plugin rewrites it before anything is
fetched:

```ts
import type { ModuleFederationRuntimePlugin } from "@module-federation/runtime/types";

const remoteEntryUrl = (): ModuleFederationRuntimePlugin => ({
  name: "epic-map-remote-entry-url",
  beforeRequest(args) {
    const remote = args.options.remotes.find((r) => r.name === "epicMap");
    if (remote && "entry" in remote) {
      remote.entry = `${yourRuntimeConfig.mapWidgetUrl}/remoteEntry.js`;
    }
    return args;
  },
});

export default remoteEntryUrl;
```

**4. Type the remote and load it.** One declaration, anywhere in your `src`:

```ts
// src/types/epic-map.d.ts
declare module "epicMap/MapWidget" {
  export { MapWidget, default } from "@bcgov/epic-map-types";
}
```

```tsx
import { lazy, Suspense } from "react";

// Outside the component: a new lazy() on every render is a new component type,
// and React remounts the map.
const MapWidget = lazy(() => import("epicMap/MapWidget"));

<Suspense fallback={<CircularProgress />}>
  <MapWidget apiBaseUrl={apiUrl} getAccessToken={getAccessToken} />
</Suspense>;
```

**Wrap that in an error boundary.** A remote that will not load rejects inside
React's lazy boundary, and with nothing to catch it the whole route tree
unmounts — so a map origin that is down would take your application with it.
[`map-web/src/components/Map/MapWidgetRemote.tsx`](../../map-web/src/components/Map/MapWidgetRemote.tsx)
is a complete one, and is what `map-web` actually renders.

Note that a retry has to reload the page. Module Federation caches a failed
remote entry for the life of the document, so re-rendering the boundary re-throws
without a second request ever leaving the browser.

### Wiring `getAccessToken`

With `react-oidc-context`:

```tsx
const { user } = useAuth();

// Called before every request, and again if one comes back 401 — so a session
// that refreshes in the background is picked up without extra wiring.
const getAccessToken = useCallback(async () => {
  const token = user?.access_token;
  if (!token) throw new Error("No access token in the host session");
  return token;
}, [user]);
```

With `keycloak-js` directly, it is
`async () => { await keycloak.updateToken(30); return keycloak.token; }`.
Anything returning a promise of a bearer token works; the map does not care where
it came from.

## Shared modules

Federation's `shared` block is where the host and the map agree to use one copy of
a module instead of two. The list lives in
[`federation.shared.mjs`](federation.shared.mjs), with a note on every entry, and
**a host copies it verbatim.**

It is copied rather than imported because a host no longer compiles anything out
of this package — reaching across for a config file would put back the coupling
federation was adopted to remove, and would not help a host in another repository
at all.

The important part is that both sides declare the same thing. Module Federation
does not share a module only one side names; it quietly loads a second copy. For
`react` that is "invalid hook call" from inside the map's stack. For
`@emotion/react` it is no error at all — just a map rendered in MUI's default
palette instead of your theme.

In this repository `scripts/check-shared-modules.mjs` compares the two lists in
CI. A host in another repository has no such check, so when this file changes it
is a change host teams are told about.

| Module | Singleton | Why |
| --- | --- | --- |
| `react`, `react-dom`, `react/jsx-runtime` | yes | Two copies is "invalid hook call" |
| `@emotion/react`, `@emotion/styled` | yes | One cache, or the map loses your theme silently |
| `@mui/material` | yes | The theme crosses the seam through React context |
| `@tanstack/react-query` | **no** | The map mounts its own provider, so nothing crosses. A host on v4 keeps v4 |

`maplibre-gl`, `axios` and `@mui/icons-material` are deliberately **not** shared —
`federation.shared.mjs` says why for each. In particular, a host does not need
maplibre installed at all any more.

## Styles

**There is nothing to import.** This is a change: `@bcgov/epic-map/styles.css` is
gone.

maplibre's stylesheet — the map's only one, since everything else is MUI's `sx` —
now travels inside the remote's JavaScript and injects itself the first time the
map loads. A federated remote has no moment at which a host resolves a file of
ours through its bundler, and a `<link>` to the map's origin would be a second
round trip that has to land before the map paints, on an origin your CSP may not
list.

It is injected as a `<style id="epic-map-widget-styles">` prepended to `<head>`,
so your own stylesheets still win on equal specificity, and it is idempotent
across remounts.

## The maplibre web worker

**This is no longer a host's problem.** It used to be the single most confusing
way for the map to fail, and the section it needed here was the longest in this
file. The remote now serves maplibre's worker beside the chunk that looks for it,
so there is nothing for a host bundler to preserve and no `optimizeDeps` entry to
add.

It is worth knowing the symptom anyway, because it is the same one the map's
*own* deployment can produce:

- the style JSON, its TileJSON and the sprite are fetched on the main thread and
  all return 200
- the map mounts, the zoom, geolocate and scale controls work, attribution renders
- no vector tile and no glyph is ever requested, because those are the worker's job
- the canvas stays blank, with no error

If that is what you are looking at, it is the worker. Under federation there are
two ways for it to happen, both on the map's side, and both covered by
[`nginx/nginx.conf`](nginx/nginx.conf):

- **`.mjs` served as `application/octet-stream`.** nginx's mime.types still has no
  entry for it as of 1.27, and `X-Content-Type-Options: nosniff` then makes the
  browser refuse to run a module worker.
- **Missing CORS.** The worker is now on the map's origin while the document is on
  the host's, and a cross-origin `new Worker(url, {type:"module"})` is blocked
  outright. maplibre 6.6 handles that itself — it detects the mismatch and starts a
  same-origin blob worker whose only statement imports the real URL — but that
  import is a cross-origin module fetch and needs `Access-Control-Allow-Origin`.

## Basemaps

The map ships with two basemaps and a switch between them:

| | Default | Source |
| --- | --- | --- |
| `standard` | **BC Basemap** (without hillshade) | [`bc-basemap`](https://catalogue.data.gov.bc.ca/dataset/bc-basemap) in the BC Data Catalogue — a public ArcGIS Online vector tile service |
| `satellite` | **Esri World Imagery** | `server.arcgisonline.com`, as a raster style assembled here |

BC Basemap is the provincial basemap recommended by the BC Gov GIS team. It is
EPSG:3857, Style Spec v8, needs no API key, and carries BC Sans and the Aboriginal
Sans/Serif faces — so provincial typography and Indigenous place names render as the
province publishes them. Attribution is declared in the style, so maplibre renders it
without any help from you.

**Two things to know before you deploy on the defaults.**

*Licensing.* BC Basemap is published "Access Only": B.C. Crown copyright, consumed
live. Do not mirror, proxy or cache its tiles. That is unremarkable for a BC Gov
application; if yours is not one, satisfy yourself that you are entitled to use it,
or replace it.

*The URLs will change.* The catalogue carries a standing notice that the service is
being reissued, with new item URLs and changes to layer order and styling. The
previous URLs are kept for at least three months after.

Either way, `basemapStyles` is the way out — it takes a URL to a Style Spec v8
document and replaces one or both defaults, so you are not waiting on a release of
this package:

```tsx
<MapWidget
  apiBaseUrl={apiUrl}
  getAccessToken={getAccessToken}
  basemapStyles={{ standard: "https://example.gov.bc.ca/styles/our-basemap.json" }}
/>
```

The label and the thumbnail on the switch stay as they are. They describe the slot —
the plain one, the imagery one — not the particular service filling it.

## Getting access in Keycloak

The map API validates the token you pass it. It reads the `azp` claim — the Keycloak
client your application signs in against — and checks it against an allowlist.
**Until your client is on that list, every call from your application returns 401.**

Two steps, in this order:

1. **Ask the EAO EPIC.map team to add your client, and your origin.** Raise an issue
   on [bcgov/EPIC.map](https://github.com/bcgov/EPIC.map/issues) with your Keycloak
   client id (the `azp` your tokens carry, e.g. `compliance-web`), **the origin your
   application is served from**, and which environments you need. Two separate lists
   on map-api have to include you and they fail differently:

   - `ALLOWED_CLIENT_IDS` — your client id. Missing, every call is a **401**.
   - `CORS_ORIGIN` — your origin. Missing, the browser blocks every call at the
     preflight and the request never reaches map-api at all. In devtools this is a
     CORS error, not a 401, and no amount of fixing your token will change it.

   Nothing about this is served by the map remote, so loading the widget
   successfully tells you nothing about either. This is the interim arrangement and
   it is what works today.

2. **Request the dedicated scope, once it exists.** The intended end state is a
   single `epic-map-api` client scope in the shared `eao-epic` realm, which your
   client requests so its tokens carry the right audience. That scope has to be
   created by the **BC Gov Pathfinder SSO team**, through the standard SSO request
   process for the realm — not by the EPIC.map team. When it lands, the allowlist
   collapses to that one entry and per-application entries go away.

Your application must be in the same realm (`eao-epic`). A token from another realm
is rejected on the issuer check, before the allowlist is consulted.

The widget calls `GET /users/me` on mount, which is where you will see this: a 200
means map-api verified the signature against Keycloak's JWKS, checked the issuer and
expiry, found your `azp` on the allowlist, and returned the user's map-db record. A
401 means one of those failed — usually step 1 above. A 403 means the token is
genuine but the user is not entitled to this application.

## What the widget does not do

Deliberate omissions. Each one is your application's job:

- **No authentication.** There is no `keycloak-js`, no `react-oidc-context`, no OIDC
  client of any kind — in any dependency block. The widget never reads
  `localStorage`, `sessionStorage` or cookies, and never redirects to a login page:
  it renders inside your tab, and navigating away would destroy your page state. It
  calls `getAccessToken()`, and on failure calls `onError` with `kind: "auth"`. What
  that means for the user is your decision. It does read the `name` and
  `preferred_username` claims out of that token to display who is signed in — the
  payload is decoded, never verified, and never used for an authorisation
  decision, which is map-api's job.
- **No routing.** No router is imported and none is assumed. The widget does not
  read or write the URL. If you want map state in the URL, drive it through props.
- **No theme of its own.** No `ThemeProvider` is created and `epic.theme` is never
  imported. Colours come from your MUI theme through context, so the widget looks
  like your application rather than like ours.
- **No opinion about its size.** The root element fills its container. No viewport
  units, no `position: fixed`. Give it a sized parent.
- **No service health reporting.** Whether the API is reachable is your concern; the
  widget reports failures through `onError` and nothing else.

## Props

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `apiBaseUrl` | `string` | yes | Base URL of map-api, including the `/api` prefix |
| `getAccessToken` | `() => Promise<string>` | yes | The only way a token enters the widget |
| `projectId` | `string` | no | Restrict the map to one project |
| `initialExtent` | `[number, number, number, number]` | no | `[west, south, east, north]`, WGS84 degrees |
| `basemapStyles` | `MapBasemapStyles` | no | Style URLs replacing either basemap — see [Basemaps](#basemaps) |
| `height` | `string \| number` | no | Defaults to `"100%"`. A number is pixels |
| `onFeatureSelect` | `(feature: MapFeature) => void` | no | User selected a feature |
| `onError` | `(error: MapWidgetError) => void` | no | `kind` is `auth`, `network`, `request`, `server` or `unknown` |

`MapWidgetProps`, `MapBasemapStyles`, `MapFeature`, `MapExtent`, `MapWidgetError`
and `MapWidgetErrorKind` are all exported from
[`@bcgov/epic-map-types`](../epic-map-types), which is where they are defined —
`src/types.ts` here re-exports that package, so the map and its hosts are checked
against one declaration.

`epicMap/MapWidget` is the only exposed module. If you need something that is not
on it, that is a gap in the API — raise it rather than reaching for another
`exposes` path, which does not exist.

## Versioning

**The map itself has no version a host can pin**, and that is the point. It is
deployed, not released: the image built from `develop` is what dev runs, and
`deploy.yml` promotes that same image to test and then prod. A host gets whatever
its environment's `map-widget` is serving, on the next page load.

What *is* versioned is the contract, [`@bcgov/epic-map-types`](../epic-map-types).
Its `version` tracks the public API — a map change that touches no prop does not
move it — and it is bumped by hand along with that package's `CHANGELOG.md`. It
is not published anywhere and nothing resolves against it; it is a label, so that
a copy someone vendored can be identified.

That split is what makes a runtime dependency safe to have. A host compiles
against a contract it chose and upgrades deliberately; the implementation behind
that contract moves underneath it without asking. What it buys in exchange is the
obligation that goes with it: **a change to the props is a change to every
deployed host at once**, so props are added, not repurposed, and nothing is
removed until the hosts have stopped passing it.

The map is versioned independently of map-api, which ships on its own schedule.
Compatibility between them is a matter of the endpoints the map calls.

## Types for a host outside this repository

`map-web` resolves the contract as an npm workspace. A host in another repository
cannot, and **there is nothing to install** — no registry, no token, no `.npmrc`.

The widget's build copies
[`packages/epic-map-types/index.d.ts`](../epic-map-types/index.d.ts) into its own
output, so every deployment serves, next to the `remoteEntry.js` it describes:

```
https://map-widget-<namespace>.apps.gold.devops.gov.bc.ca/epic-map.d.ts
```

A host downloads that into its source tree and commits it. Which is the whole
mechanism, and it is deliberately the same shape as
[`federation.shared.mjs`](federation.shared.mjs): a small file a host copies,
rather than a dependency that drags a registry, an auth token and a release
process behind it.

### Keeping the copy honest

Vendoring a file usually means it quietly goes stale. Here it cannot go stale
unnoticed, because the file is served *by the deployment the host actually loads
the map from* — so the check is a diff against the environment, not against a
version number someone remembered to bump:

```bash
#!/usr/bin/env bash
# scripts/check-map-types.sh — run in CI, and whenever you want the new props.
set -euo pipefail

URL="${MAP_WIDGET_URL:?set it to the map origin for this environment}/epic-map.d.ts"
VENDORED="src/types/epic-map-types.d.ts"

curl -fsS "$URL" -o /tmp/epic-map.d.ts

if ! diff -u "$VENDORED" /tmp/epic-map.d.ts; then
  echo "::error::$VENDORED is out of date with $URL. Copy it over and commit."
  exit 1
fi
```

Point it at **prod**, not dev: dev is where an unreleased prop appears first, and
a host that vendors from there compiles against something no other environment
serves yet.

The copy is emitted byte for byte with no banner or generated header, precisely
so that `diff` is the whole check and a match means identical.

### What the check can and cannot tell you

A diff means the props changed. It does not mean anything broke — the contract
is additive, so the usual result is new props a host may ignore.

The direction that matters is the one a diff cannot save you from. A host is
compiled and deployed; the remote keeps moving. If a prop were ever removed or
narrowed, the host's vendored copy would keep saying it was fine and the failure
would land in that host's browser rather than in anyone's build. That is the cost
of loading the map at runtime, and the reason the rule in
[Versioning](#versioning) is that props are added and never repurposed.

## Deployment

The build output is a static directory — `remoteEntry.js` and its chunks — served
by nginx. There is no configuration in the image and no ConfigMap on the
deployment: every value the map uses arrives as a prop from whichever host mounted
it.

| | |
| --- | --- |
| Image | [`Dockerfile`](Dockerfile), built from the **repository root** |
| Server | [`nginx/nginx.conf`](nginx/nginx.conf) |
| Chart | [`deployment/charts/map-widget`](../../deployment/charts/map-widget) |
| CD | [`.github/workflows/widget-cd.yml`](../../.github/workflows/widget-cd.yml) → dev |
| Promotion | [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) → test, prod |

Two things in the nginx config are load-bearing rather than boilerplate, and both
are explained in the file: the CORS headers, without which no host can load
anything here, and the cache policy. On caching, `remoteEntry.js` must be
revalidated on every request — it is the one file whose name never changes, every
other asset is resolved through it, so a cached copy pins the whole map at the
version it names, and a deploy goes out that nobody sees.

The deployment also serves `/epic-map.d.ts` — the public contract, copied out of
`packages/epic-map-types` by the build, so the types a host team takes come from
the same artifact as the code they describe. See
[Types for a host outside this repository](#types-for-a-host-outside-this-repository).

Rolling out the map does not restart any host, and does not need to.

## Source layout

```
src/
  exposes/         The federated entry point. exposes/MapWidget.ts is what
                   `epicMap/MapWidget` resolves to, and the only module a host
                   can reach. Anything not reachable from here is private.
  types.ts         Re-exports @bcgov/epic-map-types, the public contract.
  globals.d.ts     Ambient declarations. Deliberately excludes vite/client.
  styles/          injectWidgetStyles.ts — maplibre's CSS, carried in the bundle.

  widget/          The root component and its wiring: providers, the QueryClient,
                   the resolved-config context. Everything a host prop touches on
                   its way in passes through here.
  api/             Talking to map-api. The axios instance (token attachment, one
                   401 retry), error normalisation, namespaced query keys, and a
                   hook per endpoint.
  utils/           Configuration constants, the API clients, and small helpers.
  components/      The map surface and the chrome around it.

federation.shared.mjs   The shared-module contract. Hosts copy this.
vite.config.ts          The remote build: exposes, shared, the maplibre worker
                        assets, and the copy of the public contract served at
                        /epic-map.d.ts.
```

**Imports inside `src` use the `@/` alias**, rooted at `src` — `@/api/client`,
never `../api/client`. Two configs have to agree for that to work:
`tsconfig.json`'s `paths`, so `tsc --noEmit` resolves it, and `vite.config.ts`'s
`resolve.alias`, so the build does.

That used to be three, because `map-web` compiled this source in one module graph
with its own and had to resolve `@/` against whichever tree the importing file
came from. It does not compile this source at all any more, so that entry is gone.

Adding a top-level folder under `src/` needs no config change; the alias is a
single prefix rule, not a list of folders.

## Working on the map

The map and the host are two servers now. From the repository root:

```bash
npm run dev          # both: the remote on 5174, map-web on 5173
```

Or separately, if you want them in their own terminals:

```bash
npm run dev:widget   # the remote, on 127.0.0.1:5174
npm run dev:web      # map-web, which loads it
```

Edits here hot-reload in the host, with real source and real stack traces. That is
the whole dev loop: there is no built `dist/` to produce first, no watch build to
keep running beside the host, and no `EPIC_MAP_SOURCE` flag — all of which existed
only because the host used to compile this package.

The address is `127.0.0.1`, not `localhost`, on purpose. On a machine with IPv6
enabled Vite binds `localhost` to `::1` alone, and anything resolving the name to
`127.0.0.1` gets a connection refused that surfaces as a bare "Failed to fetch".

To exercise the real build instead of the dev server:

```bash
npm run build:widget && npm run preview:widget
```

| Command | Description |
| --- | --- |
| `npm run build` | The federated build to `dist/` |
| `npm run dev` | Dev server on 5174, serving `remoteEntry.js` with HMR |
| `npm run preview` | Serve a built `dist/` on 5174 |
| `npm run lint` | ESLint over `src` — also where the contract above is enforced |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

The rules in [`.eslintrc.cjs`](.eslintrc.cjs) are the enforced half of
["What the widget does not do"](#what-the-widget-does-not-do): bans on
`import.meta.env`, on browser storage, on OIDC and router imports, and on
`epic.theme` and `<ThemeProvider>`. Each rule carries its reasoning in its own
message, so a violation explains itself at the point it is hit.

### Checking it against a host

`map-web` carries the one test neither side's own build can run —
`src/components/Map/MapWidgetRemote.cy.tsx`, which loads the real remote over HTTP
and asserts that React and MUI actually crossed the seam. It needs this package
running:

```bash
npm run dev:widget
npx cypress run --component --spec "src/components/Map/MapWidgetRemote.cy.tsx" -w map-web
```

Changelogs are written by hand: the map's in [`CHANGELOG.md`](CHANGELOG.md),
and the contract's in [`../epic-map-types/CHANGELOG.md`](../epic-map-types/CHANGELOG.md)
alongside a bump to its `version`. Nothing is published, so there is no release
tooling and no tag — a merge to `develop` is the release.
