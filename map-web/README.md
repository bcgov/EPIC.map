# map-web

Front end for EPIC.map — a React + TypeScript app built with Vite, served by nginx in deployed
environments.

It is also the **reference host** for [`@bcgov/epic-map`](../packages/epic-map): the `/map` route
embeds the widget exactly as another EPIC application would. See
[Embedding the map widget](#embedding-the-map-widget).

## Stack

| Concern | Library |
| --- | --- |
| UI | React 18, [MUI 5](https://mui.com/) |
| Design system | [`epic.theme`](https://www.npmjs.com/package/epic.theme) (BC Design System tokens + EAO theme) |
| Routing | [TanStack Router](https://tanstack.com/router) (file based) |
| Server state | [TanStack Query](https://tanstack.com/query) + axios |
| Auth | Keycloak via [`react-oidc-context`](https://github.com/authts/react-oidc-context) |
| Build/dev | Vite, TypeScript, ESLint |

## Getting started

Requires Node 18+.

```bash
cd map-web
npm install
cp sample.env .env   # then fill in the values below
npm run dev
```

The dev server runs on <http://localhost:3000>. The port is pinned in `vite.config.ts` because the
API only allows a fixed list of origins — see [Talking to the API](#talking-to-the-api).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 3000 |
| `npm run build` | Type check (`tsc`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src` (warnings fail the run) |

### Environment variables

Copy `sample.env` to `.env` (git ignored) and set:

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of map-api, including the `/api` prefix — e.g. `http://localhost:5000/api` |
| `VITE_APP_URL` | Base URL this app is served from; used to build the OIDC redirect URIs |
| `VITE_APP_TITLE` | Title shown in the app bar |
| `VITE_ENV` | Environment name. `local` enables the React Query devtools |
| `VITE_VERSION` | Version string, surfaced through `AppConfig` |
| `VITE_OIDC_AUTHORITY` | Keycloak realm URL |
| `VITE_CLIENT_ID` | Keycloak client id |

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
  hooks/            React Query hooks (one file per resource)
  routes/           File based routes; routeTree.gen.ts is generated, do not edit
  styles/           theme.tsx (epic.theme) and App.scss
  utils/            config, constants, axios clients
```

### Routing

Routes are files under `src/routes` — adding a file adds a route, and the Vite plugin regenerates
`src/routeTree.gen.ts` on dev/build. The root route (`__root.tsx`) wraps every page in `AppLayout`.
Left navigation entries live in `src/components/Shared/SideNav/navItems.ts`.

Current routes: `/` (Launchpad), `/request-access`, `/oidc-callback`, `/session-expired`, and -
behind the sign-in guard - `/application-urls` and `/map`. Everything except the map page is a
`ComingSoon` placeholder, and the map page embeds the `@bcgov/epic-map` widget.

Pages that require a signed-in user are files under `src/routes/_authenticated/`. The leading
underscore makes `_authenticated.tsx` a layout route: it wraps its children with the guard without
adding a path segment, so `src/routes/_authenticated/map.tsx` is still served at `/map`.

## Embedding the map widget

The map UI lives in `@bcgov/epic-map`, a workspace package. `src/routes/_authenticated/map.tsx`
renders it the way a real host would:

```tsx
<MapWidget
  apiBaseUrl={AppConfig.apiUrl}    // this app's config, not the widget's
  getAccessToken={getAccessToken}  // this app's OIDC session, not the widget's
/>
```

The widget's optional props — `projectId`, `initialExtent`, `height`, `onFeatureSelect` and
`onError` — are not passed yet, so nothing here currently exercises them. A dev-only panel that drove
them at runtime was removed; it can come back, or be replaced by tests in the package itself.

Two rules apply to this side of the boundary:

- **Only the public entry point.** Import from `"@bcgov/epic-map"`, never from a path inside it. If
  something needed here is not exported, the widget's public API is wrong — fix the package, do not
  deep-import.
- **The host owns the session.** `getAccessToken` closes over `useAuth()` from react-oidc-context.
  The widget has no OIDC library and no access to storage.

### Working on the widget

Vite resolves `@bcgov/epic-map` to the package's **built** `dist/`, not its `src/`. Editing widget
source has no effect on the running dev server until it is rebuilt, so run the package's watch build
alongside:

```bash
npm run dev -w @bcgov/epic-map   # vite build --watch
npm run dev -w map-web           # in another terminal
```

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

The API restricts origins through its `CORS_ORIGIN` setting (see `map-api/sample.env`). Requests
from a port outside that list fail as CORS errors, which is why the dev server is pinned to 3000.
