# map-web

Front end for EPIC.map — a React + TypeScript app built with Vite, served by nginx in deployed
environments.

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
    Map/            Map page: search bar, filter buttons, map container placeholder
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

Current routes: `/` (Launchpad), `/request-access`, `/application-urls`, `/map`, `/oidc-callback`.
Everything except the map page is a `ComingSoon` placeholder, and the map page renders a container
that will hold the map.

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
