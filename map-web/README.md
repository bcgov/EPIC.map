# map-web

Front end for EPIC.map — a React + TypeScript app built with Vite, served by nginx in deployed
environments.

It is also the **reference host** for [the EPIC map](../packages/epic-map): the `/map` route loads
the map over Module Federation exactly as another EPIC application would. See
[Embedding the map](#embedding-the-map).

## Stack

| Concern       | Library                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------- |
| UI            | React 18, [MUI 5](https://mui.com/)                                                            |
| Design system | [`epic.theme`](https://www.npmjs.com/package/epic.theme) (BC Design System tokens + EAO theme) |
| Routing       | [TanStack Router](https://tanstack.com/router) (file based)                                    |
| Server state  | [TanStack Query](https://tanstack.com/query) + axios                                           |
| Auth          | Keycloak via [`react-oidc-context`](https://github.com/authts/react-oidc-context)              |
| Build/dev     | Vite, TypeScript, ESLint                                                                       |

## Getting started

Requires Node 24 — what CI and the production image build on. This is an npm workspace, so
dependencies are installed once from the **repository root**, not from here:

```bash
npm install          # repository root
cd map-web
cp sample.env .env   # then fill in the values below
cd ..
npm run dev          # this app on 5173, and the map remote on 5174
```

`npm run dev` from the root starts **both** servers, because the map is not part of this bundle —
it is fetched at runtime from the origin in `VITE_MAP_WIDGET_URL`, which defaults to the map's local
dev server. Running `npm run dev` from this directory starts only this app, and the `/map` route
then shows its "could not be loaded" state until the other one is up.

The dev server runs on Vite's default port, <http://localhost:5173>, which is what `sample.env` sets
`VITE_APP_URL` to. The port matters: the API only accepts a fixed list of browser origins, and its
local default list covers 5173, 3000 and 8000 — see [Talking to the API](#talking-to-the-api).

### Scripts

| Command           | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server (this app only — see above) |
| `npm run start`   | Alias for `npm run dev`                               |
| `npm run build`   | Type check (`tsc`) and build to `dist/`               |
| `npm run preview` | Serve the production build locally                    |
| `npm run lint`    | ESLint over `src` (warnings fail the run)             |

From the repository root, `npm run dev` runs this app and the map remote together; `npm run dev:web`
and `npm run dev:widget` run one each.

### Environment variables

Copy `sample.env` to `.env` (git ignored) and set:

| Variable              | Description                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_URL`        | Base URL of map-api, including the `/api` prefix — e.g. `http://localhost:5000/api`                                                  |
| `VITE_APP_URL`        | Base URL this app is served from; used to build the OIDC redirect URIs                                                               |
| `VITE_APP_TITLE`      | Title shown in the app bar                                                                                                           |
| `VITE_ENV`            | Environment name. `local` enables the React Query devtools                                                                           |
| `VITE_VERSION`        | Version string, surfaced through `AppConfig`                                                                                         |
| `VITE_OIDC_AUTHORITY` | Keycloak realm URL                                                                                                                   |
| `VITE_CLIENT_ID`      | Keycloak client id                                                                                                                   |
| `VITE_MAP_WIDGET_URL` | Origin serving the map's Module Federation remote, no trailing path. Defaults to `http://127.0.0.1:5173`, the map's local dev server |

In deployed environments the same values can be injected at runtime as `window._env_` (an `env.js`
mounted by the deployment); `src/utils/config.ts` prefers `window._env_` and falls back to the
build-time `VITE_*` values.

## Project structure

```
src/
  components/
    Map/            ApiStatusBar (health check)
    Shared/
      Header/       EAOAppBar, SignInControl, UserProfileMenu
      SideNav/      SideNavBar and its nav item list
      Layout/       AppLayout — the app shell
      Popups/       Snackbar and confirmation dialog
  hooks/            React Query hooks — useApiStatus (ops probe), useAuthorization
  models/           Types for what the API returns (User)
  routes/           File based routes; routeTree.gen.ts is generated, do not edit
  styles/           theme.tsx (epic.theme) and App.scss
  utils/            config, constants, axios clients
  assets/images/    BC and EAO logos
```

### Routing

Routes are files under `src/routes` — adding a file adds a route, and the Vite plugin regenerates
`src/routeTree.gen.ts` on dev/build. The root route (`__root.tsx`) wraps every page in `AppLayout`.
Left navigation entries live in `src/components/Shared/SideNav/navItems.ts`.

Current routes: `/` (Launchpad, a `ComingSoon` placeholder), `/oidc-callback`, `/session-expired`,
and — behind the sign-in guard — `/map`, which loads the federated map. The two sign-in
routes are listed in `BARE_ROUTE_IDS` in `__root.tsx` and render without the app shell. Left
navigation shows Launchpad and Map.

Pages that require a signed-in user are files under `src/routes/_authenticated/`. The leading
underscore makes `_authenticated.tsx` a layout route: it wraps its children with the guard without
adding a path segment, so `src/routes/_authenticated/map.tsx` is still served at `/map`.

## Embedding the map

The map is a **Module Federation remote**: a separate deployment, fetched over HTTP when the `/map`
route renders. Nothing of it is in this bundle — no map code, no maplibre, no stylesheet.

`src/routes/_authenticated/map.tsx` renders it the way a real host would:

```tsx
<MapWidgetRemote
  apiBaseUrl={AppConfig.apiUrl} // this app's config, not the map's
  getAccessToken={getAccessToken} // this app's OIDC session, not the map's
/>
```

The optional props — `projectId`, `initialExtent`, `height`, `onFeatureSelect` and `onError` — are
not passed yet, so nothing here currently exercises them. A dev-only panel that drove them at
runtime was removed; it can come back, or be replaced by tests in the package itself.

Four pieces make that work, and each is a file worth knowing about:

| File                                     | What it does                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `vite.config.ts`                         | Declares the `epicMap` remote and the `shared` modules                  |
| `federation.shared.mjs`                  | The shared-module list. A **copy** of the map's, and it has to stay one |
| `src/federation/remoteEntryUrl.ts`       | Rewrites the remote's URL at runtime from `window._env_`                |
| `src/components/Map/MapWidgetRemote.tsx` | Loads it, with the Suspense fallback and the error boundary             |
| `src/types/epic-map.d.ts`                | Types `epicMap/MapWidget` against `@bcgov/epic-map-types`               |

Rules that apply to this side of the boundary:

- **The host owns the session.** `getAccessToken` closes over `useAuth()` from react-oidc-context.
  The map has no OIDC library and no access to storage.
- **Only the exposed module.** `epicMap/MapWidget` is the entire surface. If something needed here
  is not on it, the map's public API is wrong — fix the package.
- **The map's URL is runtime configuration, never build-time.** One image is promoted through dev,
  test and prod, and each points at its own `map-widget`. `VITE_MAP_WIDGET_URL` comes from the
  ConfigMap-mounted `window._env_`, like every other deployed value.
- **A failure to load must not escape.** A rejected remote import unmounts the route tree if nothing
  catches it, so `MapWidgetRemote`'s error boundary is load-bearing rather than polish.
- **`federation.shared.mjs` must agree with the map's copy.** A module only one side declares is
  loaded twice: for React that is "invalid hook call", for emotion it is a map silently rendered
  without this app's theme. `scripts/check-shared-modules.mjs` checks this in CI.

### Working on the map

The map is a separate dev server, so there is nothing to build first and no watch step. From the
repository root:

```bash
npm run dev          # this app on 5173, the map on 5174, both hot-reloading
```

Edits to map source hot-reload straight into this app. The old arrangement — a built `dist/` this
app resolved through node_modules, plus `EPIC_MAP_SOURCE=1` to bypass it — is gone along with the
build-time dependency that made it necessary.

To run this app against the map's real build instead of its dev server:

```bash
npm run build:widget && npm run preview:widget   # in one terminal
npm run dev:web                                  # in another
```

Point `VITE_MAP_WIDGET_URL` at a deployed environment to develop against that instead.

### A console warning you will see in dev

Local development logs this once on boot, from `main.tsx`:

> Warning: You are importing createRoot from "react-dom" which is not supported.
> You should instead import it from "react-dom/client".

**The import is already correct**, and the warning does not appear in a production
build. It is an interaction between Vite's dependency optimizer and Module
Federation's shared-module rewriting, and it only exists on the dev server:

- `react-dom` is a shared singleton, so the plugin rewrites `react-dom/client`'s
  internal `require("react-dom")` to a lazily-resolved `mf-shared:react-dom` inside
  Vite's prebundle of it.
- `react-dom/client` exists only to set `usingClientEntryPoint` on react-dom's
  internals before delegating, and after that rewrite the object it sets the flag on
  is not the one `react-dom`'s own `createRoot` reads it back off. React sees the
  flag unset and assumes the deprecated import.
- React only carries that check in its development build, which is why a production
  bundle is silent.

Verified rather than assumed: reproduced against the dev server, confirmed absent
against `npm run build && npm run preview`, and confirmed to be independent of the
map remote — it happens with the remote's origin completely down.

The one thing that removes it is dropping `react-dom` from `federation.shared.mjs`,
which is not worth it. The map imports no react-dom of its own, but the copy of MUI
it would fall back to does; if a host ever loses the MUI negotiation, an unshared
react-dom means a second renderer in the page. A dev-only console line is the
cheaper of those two.

Tried and did not help: declaring `react-dom/client` as its own shared singleton,
`shareStrategy: "loaded-first"`, excluding `react-dom/client` from the optimizer,
and importing `createRoot` as a named import.

### Testing the seam

`src/components/Map/MapWidgetRemote.cy.tsx` is the one test neither side's build can run: it loads
the real remote over HTTP and asserts that the map mounted, styled itself, and got this app's React
and MUI rather than its own copies. It needs the map running on `VITE_MAP_WIDGET_URL`:

```bash
npm run dev:widget        # repository root, in another terminal
npx cypress run --component --spec "src/components/Map/MapWidgetRemote.cy.tsx"
```

Nothing in it is stubbed, on purpose: a test that mocked the remote would pass on exactly the
misconfigurations it exists to catch.

### Building the production image

The image is built from the **repository root**, not from here, because this is an npm workspace and
installs from the root lockfile:

```bash
docker build . --file map-web/Dockerfile --tag map-web
```

It installs, builds this app, and serves the result from nginx. Note what it does **not** copy in:
`packages/epic-map`. The map is fetched at runtime, so it is not part of this image — only
`@bcgov/epic-map-types` is needed, and only so `tsc` has a contract to check the map route against.

`.dockerignore` at the root keeps `node_modules`, `dist` and any local `.env` out of the context —
the deployed app reads its configuration from `window._env_` at runtime, so a developer's `.env`
must never be baked into the bundle.

## Authentication

Sign-in is IDIR, through Keycloak on the BC Gov login proxy, using
[`react-oidc-context`](https://github.com/authts/react-oidc-context). `OidcConfig` in
`src/utils/config.ts` sets `kc_idp_hint: "idir"`, so the user goes straight to the IDIR login form
rather than the provider chooser.

The flow:

1. A route under `src/routes/_authenticated/` renders `_authenticated.tsx`, which stores where the
   user was headed in `sessionStorage` and calls `signinRedirect()`.
2. Keycloak returns to `/oidc-callback`, which waits for the session and then for
   `GET /users/me` - the call that provisions the user's record on the API side - before sending
   them on to the page they originally asked for.
3. `useCurrentUser` (`src/hooks/useAuthorization.tsx`) holds that profile, including the
   `permissions` the API reports. Gate UI on `useHasPermission([...])` rather than decoding the
   token in the browser: the API reads permissions from a token it has already verified.

The role model is still to be decided, so today the API reports every signed-in user as `User`
regardless of what their token carries — `useHasPermission([Permission.USER])` is true for
everyone. It is wired up so that gating UI on it now keeps working unchanged once real roles exist.

A user who signs in successfully but has no access to EPIC.map gets the `Unauthorized` screen
instead of the page - the API answers `GET /users/me` with a 403, and the guard renders that rather
than an empty page or a redirect loop.

Access tokens are renewed from the `accessTokenExpiring` event in `src/router.tsx` rather than by
`automaticSilentRenew`, so that a failed renewal lands the user on `/session-expired` with a way
back in, instead of surfacing later as an unexplained 401.

## Styling

Styling comes from `epic.theme` — do not hardcode colours, sizes or font weights:

- **MUI theme** (`src/styles/theme.tsx`) via `createAppTheme` — palette, typography and component
  defaults. Prefer theme-driven props (`color="primary"`, `variant="contained" color="secondary"`,
  typography variants) over custom styling; the theme already matches the BC design system.
- **`BCDesignTokens`** for anything the theme does not cover — `surfaceColorBorderDefault`,
  `surfaceColorBackgroundLightGray`, `typographyFontSizeSmallBody`, `layoutBorderRadiusMedium`, etc.
- When a design calls for a tint that has no token, derive it from one with MUI's `alpha()` rather
  than pasting a hex value (see `SideNavBar.tsx`).
- `<CssBaseline />` is rendered in `App.tsx`; it applies `box-sizing: border-box` and the theme's
  scrollbar styling, so neither belongs in `App.scss`.

Reference material: the visual design lives in the `epic-map-prototype` repo (`styles/app.css`,
`styles/tokens.css`), and `EPIC.compliance/compliance-web` is the reference for how these components
are structured in a full EPIC app.

## Talking to the API

`src/utils/axiosUtils.ts` exposes two clients:

- `request` — the secured API (`VITE_API_URL`). An interceptor attaches the Keycloak access token
  and throws if the user is not signed in.
- `requestOps` — the unauthenticated ops endpoints (`/ops`), derived from `VITE_API_URL` by dropping
  the trailing `/api`.

Both unwrap `response.data`. Wrap calls in a React Query hook under `src/hooks` rather than calling
them from components — `useApiStatus.tsx` (the `/ops/readyz` probe rendered on the map page) is the
smallest example.

The API restricts origins through its `CORS_ORIGIN` setting (see `map-api/sample.env`), falling back
to `LOCAL_CORS_ORIGINS` in `map-api/src/map_api/config.py` when it is unset. Requests from an origin
outside that list fail as CORS errors. The dev server's port is not pinned in `vite.config.ts`, so if
you run it on something other than 5173, 3000 or 8000, add that origin to the API's list and update
`VITE_APP_URL` to match — the OIDC redirect URIs are derived from it.
