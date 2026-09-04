# @bcgov/epic-map

The EPIC map as an embeddable React component. Install it, render it, point it at
the EPIC.map API — your application keeps its own routing, its own session and its
own theme.

> **Status: pre-1.0.** The props below are stable and enforced, but the map surface
> itself is still a placeholder while the rendering moves across from `map-web`.
> Treat minor versions as breaking until 1.0.0, per semver.

- [Install](#install)
- [Peer dependencies](#peer-dependencies)
- [Styles](#styles)
- [Minimal working example](#minimal-working-example)
- [Getting access in Keycloak](#getting-access-in-keycloak)
- [Lazy load it](#lazy-load-it)
- [What the widget does not do](#what-the-widget-does-not-do)
- [Props](#props)
- [Versioning](#versioning)

## Install

Published to **GitHub Packages**, not the public npm registry. Point the `@bcgov`
scope at GitHub in your `.npmrc`:

```ini
# .npmrc
@bcgov:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` needs the `read:packages` scope. In GitHub Actions the built-in
`secrets.GITHUB_TOKEN` is enough.

```bash
npm install @bcgov/epic-map
```

Pin the version you tested against. Releases are tagged deliberately — nothing is
published from a merge to `main` — so upgrading is always something you opt into.

## Peer dependencies

These are peer dependencies, not dependencies: your application supplies them, and
the widget uses your copy. Two copies of React means every hook throws
"invalid hook call", and two copies of MUI means the widget stops seeing your theme.

| Package | Range |
| --- | --- |
| `react` | `^18.2.0` |
| `react-dom` | `^18.2.0` |
| `@mui/material` | `^5.15.20` |
| `@mui/icons-material` | `^5.15.21` |
| `@emotion/react` | `^11.11.4` |
| `@emotion/styled` | `^11.11.5` |
| `epic.theme` | `^1.0.11` |

`epic.theme` is the odd one: the widget never imports it. It is listed because the
widget reads colours from your MUI `ThemeProvider`, and it only looks right inside
an EAO theme. If your application is themed with `epic.theme` already — every EPIC
application is — you have nothing to do.

`maplibre-gl`, `@tanstack/react-query` and `axios` are ordinary dependencies and
install themselves.

## Styles

**Import one stylesheet, ours.**

```ts
import "@bcgov/epic-map/styles.css";
```

That is the whole styling contract. maplibre-gl's own CSS is already inside it: the
widget imports `maplibre-gl/dist/maplibre-gl.css` in its entry point and the library
build extracts it into `dist/epic-map.css`.

**Do not also import `maplibre-gl/dist/maplibre-gl.css`.** It is redundant.

The alternative — asking every host to import maplibre's stylesheet themselves — was
rejected because forgetting it produces no error. The map renders, and the zoom
controls, popups and attribution are quietly unstyled. One import that either works
or fails loudly is worth the tradeoff, which is this: our copy of maplibre's CSS is
frozen at the version we built against, while your `node_modules` resolves the
JavaScript through our semver range. Across a maplibre major that could drift, so we
keep the range narrow and re-publish when it moves.

## Minimal working example

Wiring `getAccessToken` from `react-oidc-context`:

```tsx
import { useCallback } from "react";
import { Box } from "@mui/material";
import { useAuth } from "react-oidc-context";
import { MapWidget } from "@bcgov/epic-map";
import "@bcgov/epic-map/styles.css";

export function MapPage() {
  const { user } = useAuth();

  // Called before every request, and again if one comes back 401 — so a session
  // that refreshes in the background is picked up without extra wiring.
  const getAccessToken = useCallback(async () => {
    const token = user?.access_token;
    if (!token) {
      throw new Error("No access token in the host session");
    }
    return token;
  }, [user]);

  return (
    // The widget fills this box. Size the container, not the widget.
    <Box sx={{ height: "70vh", minHeight: 0 }}>
      <MapWidget
        apiBaseUrl={import.meta.env.VITE_MAP_API_URL}
        getAccessToken={getAccessToken}
        onError={(error) => console.error(error.kind, error.message)}
      />
    </Box>
  );
}
```

If your application uses `keycloak-js` directly rather than `react-oidc-context`,
`getAccessToken` is `async () => { await keycloak.updateToken(30); return keycloak.token; }`.
Anything that returns a promise of a bearer token works; the widget does not care
where it came from.

A live version of this wiring, including a control panel for the optional props, is
in [`map-web/src/routes/_authenticated/map.tsx`](../../map-web/src/routes/_authenticated/map.tsx).
That application is the reference host — copy from it.

## Getting access in Keycloak

The map API validates the token you pass it. It reads the `azp` claim — the Keycloak
client your application signs in against — and checks it against an allowlist.
**Until your client is on that list, every call from your application returns 401.**

Two steps, in this order:

1. **Ask the EAO EPIC.map team to add your client.** Raise an issue on
   [bcgov/EPIC.map](https://github.com/bcgov/EPIC.map/issues) with your Keycloak
   client id (the `azp` your tokens carry, e.g. `compliance-web`) and which
   environments you need. It is added to `ALLOWED_CLIENT_IDS` on map-api. This is the
   interim arrangement and it is what works today.

2. **Request the dedicated scope, once it exists.** The intended end state is a
   single `epic-map-api` client scope in the shared `eao-epic` realm, which your
   client requests so its tokens carry the right audience. That scope has to be
   created by the **BC Gov Pathfinder SSO team**, through the standard SSO request
   process for the realm — not by the EPIC.map team. When it lands, the allowlist
   collapses to that one entry and per-application entries go away.

Your application must be in the same realm (`eao-epic`). A token from another realm
is rejected on the issuer check, before the allowlist is consulted.

## Lazy load it

**Recommended.** maplibre-gl is 568 kB minified (~140 kB gzipped) before anything
else the widget pulls in. Loading it on a route nobody visited is a real cost to
your first paint.

```tsx
import { Suspense, lazy } from "react";
import { CircularProgress } from "@mui/material";

const MapWidget = lazy(async () => {
  const { MapWidget } = await import("@bcgov/epic-map");
  return { default: MapWidget };
});

<Suspense fallback={<CircularProgress />}>
  <MapWidget apiBaseUrl={apiBaseUrl} getAccessToken={getAccessToken} />
</Suspense>;
```

The stylesheet import can stay at the top level — it is small and static — or move
into the dynamic import if you would rather it split too. The package is ESM with
`sideEffects` declared, so bundlers split it cleanly.

## What the widget does not do

Deliberate omissions. Each one is your application's job:

- **No authentication.** There is no `keycloak-js`, no `react-oidc-context`, no OIDC
  client of any kind — in any dependency block. The widget never reads
  `localStorage`, `sessionStorage` or cookies, and never redirects to a login page:
  it renders inside your tab, and navigating away would destroy your page state. It
  calls `getAccessToken()`, and on failure calls `onError` with `kind: "auth"`. What
  that means for the user is your decision.
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
| `height` | `string \| number` | no | Defaults to `"100%"`. A number is pixels |
| `onFeatureSelect` | `(feature: MapFeature) => void` | no | User selected a feature |
| `onError` | `(error: MapWidgetError) => void` | no | `kind` is `auth`, `network`, `request`, `server` or `unknown` |

`MapWidgetProps`, `MapFeature`, `MapExtent`, `MapWidgetError` and `MapWidgetErrorKind`
are exported as types. Nothing else is public: if you need something that is not
exported from `@bcgov/epic-map`, that is a gap in the API — raise it rather than
importing from a path inside the package, which will break without a major version.

## Versioning

The widget is **semver-versioned independently of map-api**. They ship on separate
schedules and their version numbers have nothing to say about each other:
`@bcgov/epic-map@2.0.0` does not imply anything about which map-api you are talking
to. Compatibility with the API is a matter of the endpoints the widget calls, and a
breaking change there is a breaking change to the widget's own major version.

Releases are cut with [changesets](https://github.com/changesets/changesets) and
published only from a `epic-map-v*` tag — never from a merge to `main`.

## Source layout

```
src/
  index.ts         The published contract. Anything not exported here may change
                   without a major version — see "Versioning" above.
  types.ts         Types that are part of that contract: props, MapFeature,
                   MapWidgetError. Internal types live next to what owns them.
  globals.d.ts     Ambient declarations. Deliberately excludes vite/client.

  widget/          The root component and its wiring: providers, the QueryClient,
                   the resolved-config context. Everything a host prop touches on
                   its way in passes through here.
  api/             Talking to map-api. client.ts builds the axios instance (token
                   attachment, one 401 retry); errors.ts normalises a throw into
                   MapWidgetError; queryKeys.ts namespaces every cache key.
  components/      The map surface and the chrome around it.
```

**Imports inside `src` use the `@/` alias**, rooted at `src` — `@/api/client`, never
`../api/client`. Three configs have to agree for that to work, and all three are
load-bearing:

| Where | Why |
| --- | --- |
| `tsconfig.json` `paths` | `tsc --noEmit` resolves it |
| `vite.config.ts` `resolve.alias` | the library build resolves it, and `vite-plugin-dts` reads the same tsconfig to rewrite it back to a relative specifier in the emitted `.d.ts` — consumers have no such alias |
| `map-web/vite.config.ts` | that application aliases `@` to *its own* `src`. With `EPIC_MAP_SOURCE=1` both trees share one module graph, so its alias resolves against whichever `src` the importing file lives in |

Adding a top-level folder under `src/` needs no config change; the alias is a single
prefix rule, not a list of folders.

## Working on the widget

Vite resolves this package to its **built** `dist/`, not `src/`, so run the watch
build alongside `map-web`:

```bash
npm run dev -w @bcgov/epic-map   # vite build --watch
npm run dev -w map-web           # in another terminal
```

| Command | Description |
| --- | --- |
| `npm run build` | Library build to `dist/` plus type declarations |
| `npm run dev` | Rebuild on change |
| `npm run lint` | ESLint over `src` — also where the contract above is enforced |
| `npm run typecheck` | `tsc --noEmit` |

The rules in [`.eslintrc.cjs`](.eslintrc.cjs) are the enforced half of "what the
widget does not do": bans on `import.meta.env`, on browser storage, on OIDC and
router imports, and on `epic.theme` and `<ThemeProvider>`. The reasoning behind them
is in [`docs/04_widget-architecture.md`](../../docs/04_widget-architecture.md).

To add a release note, run `npm run changeset` at the repository root and describe
the change; the file it writes is reviewed with your PR.
