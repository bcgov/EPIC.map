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
* Start the databases
    - Run `docker-compose up` in the root of the project (map-api)

## Environment Variables

The development scripts for this application allow customization via an environment file in the root directory called `.env`. See an example of the environment variables that can be overridden in `sample.env`.

## Authentication

Every route under `/api` requires an IDIR access token issued by the shared EAO
realm on the BC Gov login proxy. Requests without one are rejected before any
handler runs; `/ops` health probes are deliberately left open.

Three things gate a request, in order:

1. **The token is verified** - signature, issuer, audience and expiry - against
   the realm's JWKS. Always on.
2. **Group membership**, if `AUTH_REQUIRED_GROUP` is set. The realm is shared
   with the other EPIC applications, so once it has a group for EPIC.map a valid
   token stops being permission to be here on its own.
3. **Client roles**, where an endpoint asks for them with
   `@auth.has_one_of_roles([...])`. Roles are read from
   `resource_access[JWT_OIDC_CLIENT_ID]`, not from the realm, so a role granted
   by another EPIC application does not carry over.

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

The relevant settings are `JWT_OIDC_*` and `AUTH_REQUIRED_GROUP` in
`sample.env`. `JWT_OIDC_CLIENT_ID` must match map-web's `VITE_CLIENT_ID`.

## Commands

### Development

The following commands support various development scenarios and needs.
Before running the following commands run `. venv/bin/activate` to enter into the virtual env.


> `make run`
>
> Runs the python application and runs database migrations.  
Open [http://localhost:5000/api](http://localhost:5000/api) to view it in the browser.<br/>
> The page will reload if you make edits.<br/>
> You will also see any lint errors in the console.

> `make test`
>
> Runs the application unit tests<br>

> `make lint`
>
> Lints the application code.

## Debugging in the Editor

### Visual Studio Code

Ensure the latest version of [VS Code](https://code.visualstudio.com) is installed.

The [`launch.json`](.vscode/launch.json) is already configured with a launch task (Map API) that allows you to launch chrome in a debugging capacity and debug through code within the editor. 