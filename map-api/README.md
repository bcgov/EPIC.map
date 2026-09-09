# MAP-API

The EPIC.map Python Flask API application.

## Getting Started

### Development Environment
* Install the following:
    - [Python](https://www.python.org/)
    - [Docker](https://www.docker.com/)
    - [Docker-Compose](https://docs.docker.com/compose/install/)
* Install Dependencies
    - Run `make setup` in the root of the project (map-api)
* Start the backing services
    - Run `docker-compose up` in the root of the project (map-api). This brings up PostGIS
      (`map-api-db` and `map-api-db-test`), redis (`map-redis`) and a local Keycloak.

## Environment Variables

The development scripts for this application allow customization via an environment file in the root directory called `.env`. See an example of the environment variables that can be overridden in `sample.env`.

## Authentication

Every route under `/api` requires an IDIR access token issued by the shared EAO
realm on the BC Gov login proxy. Requests without one are rejected before any
handler runs; `/ops` health probes are deliberately left open.

Four things gate a request, in order:

1. **The token is verified** - signature, issuer and expiry - against the
   realm's JWKS. Always on.
2. **The issuing client is on the allowlist.** This API backs several EPIC
   applications, each with its own Keycloak client in the shared realm, and in
   that realm they all receive `aud: "account"` - so one audience string cannot
   describe who may call. `ALLOWED_CLIENT_IDS` is checked against the `aud` and
   `azp` claims instead, on the already-verified payload. An unlisted client is
   a 401. An empty allowlist denies everything, deliberately: a misconfigured
   deployment should stop serving rather than accept any client in a shared
   realm. See `MultiClientJwtManager` in `auth.py` and `is_allowed_client` in
   `utils/token.py`.
3. **Group membership**, if `AUTH_REQUIRED_GROUP` is set. The realm is shared
   with the other EPIC applications, so once it has a group for EPIC.map a valid
   token stops being permission to be here on its own.
4. **Client roles**, where an endpoint asks for them with
   `@auth.has_one_of_roles([...])`. Roles are read from `resource_access`, not
   from the realm, so a role granted by another EPIC application does not carry
   over.

`GET /api/users/me` returns the signed-in user and their permissions. The first
call creates their local `staff_users` row, so a user does not have to be seeded
by an administrator before they can sign in - Keycloak decides who gets in, and
that row is a profile, not an allowlist.

### Current state: groups and roles are not enforced

The realm has no group or client roles for EPIC.map yet, so both of the
optional checks above are switched off:

- **`AUTH_REQUIRED_GROUP` is empty**, which means any valid IDIR token from the
  `eao-epic` realm is accepted - including staff who only work in EPIC.compliance
  or EPIC.track. The API logs a warning at startup while this is the case. Set
  it to `MAP` once the realm has that group and the `epic-map` client has a
  Group Membership mapper putting `groups` in the token.
- **No endpoint asks for a role.** Every signed-in user is reported with the
  `User` permission, from `DEFAULT_PERMISSIONS` in `utils/constant.py`, whether
  or not their token carries a client role. Any role the token *does* carry is
  added on top, so turning roles on later is a matter of emptying
  `DEFAULT_PERMISSIONS` and putting `@auth.has_one_of_roles([...])` back on the
  endpoints that need it.

The relevant settings are `JWT_OIDC_*`, `ALLOWED_CLIENT_IDS` and
`AUTH_REQUIRED_GROUP` in `sample.env`. `ALLOWED_CLIENT_IDS` is the one to change
when another EPIC application starts embedding the map — add its Keycloak client
id, the `azp` its tokens carry. `JWT_OIDC_AUDIENCE` is only the fallback used
when `ALLOWED_CLIENT_IDS` is unset, and `JWT_OIDC_CLIENT_ID` no longer decides
who may call.

Requests that reach a handler are recorded by `AuditService` — auth guid, IDIR
username, the calling application from `azp`, method, path and status. The table
is append-only; rows are never updated or deleted.

## Commands

### Development

The following commands support various development scenarios and needs.
Before running the following commands run `. venv/bin/activate` to enter into the virtual env.


> `make run`
>
> Runs the database migrations, then the application, on port 5000.
> Open [http://localhost:5000/api](http://localhost:5000/api) for the Swagger UI.
> Note that this does **not** reload on edit — use `make debug` for that.

> `make debug`
>
> Same, with Flask's reloader on. Migrations are deliberately skipped, so the
> server still starts when Postgres is down.

> `make db`
>
> Runs `flask db upgrade` on its own. `make db-migrate` creates a new migration,
> `make db-downgrade` steps back one.

> `make test`
>
> Runs the application unit tests.

> `make lint`
>
> Lints the application code (pylint and flake8). `make lintfix` applies autopep8.

The Swagger UI and `/swagger.json` are served only outside production-like
environments — see `DOCS_ENABLED` in `resources/__init__.py`.

## Debugging in the Editor

### Visual Studio Code

Ensure the latest version of [VS Code](https://code.visualstudio.com) is installed.

The repository's [`launch.json`](../.vscode/launch.json) already has a **Map API**
configuration that runs `map-api/wsgi.py`, so you can set breakpoints and debug
through the code from within the editor. 