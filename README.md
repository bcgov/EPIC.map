# EPIC.map

EPIC.map is three things in one repository: a standalone API, the EPIC map as a federated front-end
service, and a web app that hosts it.

## Repository layout

| Path | What it is | How it ships |
| --- | --- | --- |
| `map-api/` | Flask API and its database. A standalone service, deployed on its own. | Deployed as `map-api` |
| `packages/epic-map/` | **The product.** The EPIC map, built as a [Module Federation](https://module-federation.io) remote that other EPIC applications load at runtime. | Deployed as `map-widget` |
| `packages/epic-map-types/` | The map's public TypeScript contract — `MapWidgetProps` and what it references. Types only, no runtime. | Not published — served by `map-widget` at `/epic-map.d.ts` |
| `map-web/` | The EPIC.map application, and the reference host. Runs the map locally against `map-api`, and shows host teams how to mount, theme and authenticate it. | Deployed as `map-web` |

All three JavaScript directories are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
declared in the root `package.json`, so one `npm install` at the root covers everything.

### Why the map is a remote, not a package

The map is embedded by several applications that release on their own schedules — `map-web` today,
EPIC.centre and EPIC.submit next. It used to be an npm package, which meant shipping a map change
required every host to bump a version, rebuild and redeploy, and until they all did there were
several different maps in production.

As a Module Federation remote, the map is deployed once and every host picks it up on its users'
next page load. **No host is rebuilt when the map changes.** There is exactly one map per
environment, and `map-web` has no map code in its bundle at all.

What that costs is build-time certainty: the map is a network dependency now, and the two sides
agree on React and MUI at load time rather than at compile time. Both have a specific answer —
an error boundary in the host, and the `shared` contract in `federation.shared.mjs`, which
`scripts/check-shared-modules.mjs` checks in CI.

[`packages/epic-map/README.md`](packages/epic-map/README.md) is the integration guide host teams
read.

### Why map-web still exists

`map-web` is not legacy and is not scheduled for deletion. It is the EPIC.map application, and it is
the reference host that other EPIC teams copy from. Anything that belongs to the *application*
rather than the *map* — routing, the auth provider, environment configuration — lives here on
purpose.

### How each piece ships

| | Trigger | Workflow |
| --- | --- | --- |
| `map-widget` | Push to `develop` touching `packages/epic-map/**` | `widget-cd.yml` → dev |
| `map-web` | Push to `develop` touching `map-web/**` | `web-cd.yml` → dev |
| `map-api` | Push to `develop` touching `map-api/**` | `api-cd.yml` → dev |
| test / prod | Manual | `deploy.yml` promotes the dev image — nothing is rebuilt on the way |

Note that `map-widget` and `map-web` are now genuinely independent: a map change no longer triggers
a `map-web` build, which is the whole point of the arrangement.

### The contract, and how host teams get it

The map has **no version** — it is deployed, not released, and a host cannot pin it. Its public
TypeScript contract lives in [`@bcgov/epic-map-types`](packages/epic-map-types), and **nothing
publishes it**. There is no registry, no token and no release tag; a merge to `develop` is the
release.

It reaches consumers two ways, neither of which is an install:

- **In this repository** — an npm workspace. `map-web` and the map both resolve it from
  `packages/`, and the map re-exports it from `src/types.ts`, so removing a prop fails the map's
  own typecheck in CI.
- **In another repository** — the map's build copies `index.d.ts` into its own output, so every
  deployment serves it next to the `remoteEntry.js` it describes, at
  `https://map-widget-<namespace>.apps.gold.devops.gov.bc.ca/epic-map.d.ts`. A host team takes a
  copy with `curl`, commits it, and diffs it against that URL in their CI to know when the props
  moved. The widget's README has the script.

That is deliberately the same arrangement as [`federation.shared.mjs`](packages/epic-map/federation.shared.mjs),
which hosts also copy: a small file taken from a known place beats a dependency that drags a
registry and its credentials along behind it.

Because the map is not versioned, **a change to its props changes every deployed host at once**. So
props are added rather than repurposed, and nothing is removed until the hosts have stopped passing
it.

### Contracts enforced in the map package

- **Configuration is by props only.** The map never reads `import.meta.env` — it runs inside hosts
  whose environment is not ours. An ESLint rule blocks it.
- **The map does no authentication.** No `keycloak-js`, no `react-oidc-context`. The host owns the
  session and hands over a token; `map-web` shows how.

[`packages/epic-map/.eslintrc.cjs`](packages/epic-map/.eslintrc.cjs) is where those are enforced,
and the "What the widget does not do" section of the map's README is the reasoning behind them.

## Setup

Node dependencies for the whole workspace are installed once, from the repository root:

```bash
npm install
```

Backend setup follows below; front end setup is [further down](#front-end-setup).

## Backend Setup in WSL

### 1. Install Python 3.12.4
Ensure Python 3.12.4 is installed in your WSL environment. Download it from the [official Python website](https://www.python.org/downloads/release/python-3124/).

### 2. Set Up PYTHONPATH
Add the following line to your `.bashrc` or `.zshrc` file to set the `PYTHONPATH` environment variable:
export PYTHONPATH="/path/to/map-api:${PYTHONPATH}"

### 3. Configure Environment Variables
Create a `.env` file in your map-api with the necessary configurations. Reference sample.env to see what variables you need to configure

### 4. Start Docker Compose
In a separate terminal, launch Docker Compose to set up your containers:
`docker-compose up`

### 5. Run Setup
Navigate to your project directory and run the setup command to prepare your development environment:
`make setup`

### 6. Run Server
Once the setup is completed use make run to start the server:
`make run`


## Backend Setup on Windows

There is no `make` on Windows, so the steps `make setup` and `make run` perform in WSL are spelled
out here.

### Step 1: Install Python 3.12

Download and install Python 3.12 from the [official Python website](https://www.python.org/downloads/).

### Step 2: Start Docker

1. Open a terminal.
2. Navigate to the `map-api` directory:

        cd map-api

3. Start the database and redis containers:

        docker-compose up

### Step 3: Set Up `map-api`

1. Open a separate terminal and navigate to the `map-api` directory:

        cd map-api

2. Create a virtual environment. Refer to the official Python documentation on how to create a
   virtual environment: [Python venv](https://docs.python.org/3/library/venv.html).

        python -m venv venv

3. Activate the virtual environment:

        venv\Scripts\activate

4. Install the required Python packages from both `dev.txt` and `prod.txt` requirements files, then
   install the project itself so `map_api` is importable:

        python -m pip install -r requirements/dev.txt
        python -m pip install -r requirements/prod.txt
        python -m pip install -e .

### Step 4: Set Environment Variables

1. Copy `sample.env` to `.env` and fill in the values.

2. Point `FLASK_APP` at the WSGI entry point:

        set FLASK_APP=wsgi.py

   `FLASK_ENV` is read from `.env` by the application's own config; Flask itself dropped that
   variable in 2.3, so setting it in the shell does not turn on the reloader. Use
   `python -m flask run --debug` for that.

3. `pip install -e .` above puts `map-api/src` on the path, so `PYTHONPATH` normally needs no setting.
   If you skipped it:

        set PYTHONPATH=path\to\map-api\src

### Step 5: Run the Database Migrations and the Server

    python -m flask db upgrade
    python -m flask run -p 5000

## Front End Setup

### 1. Install Dependencies
From the repository root — one install covers `map-web`, the map and its types package:

    npm install

There is no build step to run first. `map-web` does not compile the map: it loads it over Module
Federation from a separate dev server, which `npm run dev` starts alongside it.

### 2. Configure Environment Variables
Copy `map-web/sample.env` to `map-web/.env` and fill in the values. At a minimum set `VITE_API_URL`
to the map-api url including the `/api` prefix (e.g. `http://localhost:5000/api`), and `VITE_APP_URL`
to the address the dev server actually serves on — the OIDC redirect URIs are derived from it.

`VITE_MAP_WIDGET_URL` is where the map is loaded from. It defaults to `http://127.0.0.1:5174`, the
map's own dev server, so it only needs setting if you want to develop against a deployed map.

### 3. Run Development Servers
From the repository root:

    npm run dev

That starts **both**: `map-web` on http://localhost:5173 and the map remote on
http://127.0.0.1:5174. Both hot-reload, including edits to map source.

Running only `npm run dev:web` starts the app without the map, and `/map` then shows its "could not
be loaded" state — which is the error boundary doing its job, not a broken checkout.

`map-web`'s port is not pinned in `vite.config.ts`, so if you change it, keep `VITE_APP_URL` in step
2 in step with it and make sure the origin is in the api's allowed list — `CORS_ORIGIN`, or the
`LOCAL_CORS_ORIGINS` fallback in
[`map-api/src/map_api/config.py`](map-api/src/map_api/config.py), which covers 5173, 3000 and 8000.

The map's port *is* pinned, at 5174, because `VITE_MAP_WIDGET_URL` names it. It binds `127.0.0.1`
rather than `localhost` on purpose: with IPv6 enabled Vite binds `localhost` to `::1` alone, and
anything resolving the name to `127.0.0.1` gets a connection refused that surfaces as a bare
"Failed to fetch".

### 4. Running Against the Map's Real Build
The dev server is not the artifact that deploys. To run the host against the real federated build:

    npm run build:widget && npm run preview:widget   # one terminal
    npm run dev:web                                  # another

### 5. Checking the Host and the Map Still Fit
Neither side's build can catch a disagreement between them — they are built separately and first
meet in a browser. Two things check it:

    node scripts/check-shared-modules.mjs    # the shared-module lists agree

and `map-web`'s component test, which loads the real remote over HTTP and asserts that React and MUI
actually crossed the seam. It needs the map running:

    npm run dev:widget    # in another terminal
    npx cypress run --component --spec "src/components/Map/MapWidgetRemote.cy.tsx" -w map-web

See `map-web/README.md` for the full front end documentation, and
[`packages/epic-map/README.md`](packages/epic-map/README.md) for the map itself.

# Helm
EPIC.map deploys into the `c8b80a` license plate on the Gold cluster, which it shares with
Compliance and Track:

    c8b80a-tools     images (ImageStreams, BuildConfigs), common to all environments
    c8b80a-dev
    c8b80a-test
    c8b80a-prod

After the `oc login` you can copy from the OpenShift command line tool page, install helm:
https://helm.sh/docs/helm/helm_install/

## Database

Postgres 16 with PostGIS 3.4, run by the Crunchy Postgres Operator that Platform Services
maintains on the cluster. The chart lives in
[`deployment/charts/map-database`](deployment/charts/map-database/README.md), which carries
the full rationale, the objects the operator derives, and the verification commands.

    cd deployment/charts/map-database
    helm dependency update .
    helm upgrade --install map-db . -f values.yaml -f values.dev.yaml -n c8b80a-dev

Test and prod are the same command with `values.test.yaml` / `values.prod.yaml`. The operator
creates the `postgis` extension itself, as superuser, in every database - the
`CREATE EXTENSION` in `migrations/versions/3b1c7a04f9d2` runs as the application role and
succeeds only because of that.

Connection details are in the operator-generated secret `map-db-pguser-map-db` (keys `user`,
`password`, `dbname`, `host`, `port`, `uri`), which `map-api`'s chart reads. `map-api` connects
through the `map-db-pgbouncer` service rather than at the primary directly.

The standalone Patroni chart this replaced pinned Postgres 12 with no PostGIS and has been
removed; don't reintroduce it without solving the PostGIS image problem first.

## Redis

`map-api` caches the DataBC catalogue index in Redis, and `/ops/healthz` - the api's liveness
probe - returns 503 when Redis doesn't answer, so a deployed environment needs it running. It
is its own Deployment and Service, not a sidecar, so the cache is shared across `map-api`
replicas. See [`deployment/charts/map-redis`](deployment/charts/map-redis/README.md).

    cd deployment/charts/map-redis
    helm upgrade --install map-redis . -f values.yaml -f values.dev.yaml -n c8b80a-dev

The chart generates the password on first install and reuses it on upgrades. `map-api` reads
the resulting `REDIS_URL` from the `map-redis` secret.

## API, web and the map

    cd deployment/charts/map-api
    helm upgrade --install map-api . -f values.yaml -f values.dev.yaml -n c8b80a-dev

    cd ../map-widget
    helm upgrade --install map-widget . -f values.yaml -f values.dev.yaml -n c8b80a-dev

    cd ../map-web
    helm upgrade --install map-web . -f values.yaml -f values.dev.yaml -n c8b80a-dev

All three are `Deployment`s. `map-api` runs its migrations in an initContainer, so a new pod
only serves traffic after `pre-hook-update-db.sh` has finished. None has an ImageChange trigger -
promoting a tag does not roll the pods by itself, which is why CI ends with
`oc rollout restart deployment/<name>`. Namespaces that still have the old DeploymentConfigs
need them deleted first; see
[`deployment/openshift/README.md`](deployment/openshift/README.md).

`map-widget` is the EPIC map, served as static Module Federation assets by nginx. It is the only
one of the three with no ConfigMap: every value the map uses arrives as a prop from whichever
host mounted it, so there is nothing to configure per environment. Install it **before**
`map-web`, whose `app.mapWidgetUrl` has to match its `app.url` - that is the value that reaches
the browser as `VITE_MAP_WIDGET_URL`, and a host pointed at nothing renders the map's "could
not be loaded" state.

Each chart has a base `values.yaml` plus `values.dev.yaml` / `values.test.yaml` /
`values.prod.yaml`; the per-environment file carries only what differs - image tag, Keycloak
URLs, CORS origins.

## Secrets

**This repo is public, so no chart templates a credential and no values file contains one.**
Anything with a real secret in it is created directly in the namespace and referenced by name.
`map-api` pulls its configuration in with `envFrom`, so a key added to one of those secrets
reaches the API on the next rollout without a chart change.

| Secret | Created by | Holds |
|---|---|---|
| `map-api-secrets` | you, by hand, once per namespace | `SECRET_KEY` |
| `map-db-pguser-map-db` | the Crunchy operator, on install | database credentials |
| `map-redis` | the `map-redis` chart, on first install | `REDIS_PASSWORD`, `REDIS_URL` |

Only the first needs a human. See
[`deployment/openshift/README.md`](deployment/openshift/README.md) for the `oc create secret`
command and the placeholder template.

- if the resource quota was exceeded you can change the values in values.yaml, you can always do that locally and install like this as well `$ helm install -f myvalues.yaml myredis ./redis`

## API

can reuse the charts here https://github.com/bcgov/EPIC.submit/tree/develop/deployment/charts the api and the api-bc

### *api.yml
Install it in the xxxx-dev with name xxx-api. Upon success you will have the Deployment, Route, Service and ConfigMap

### *bc.yml
Install it in a xxxx-tools with bane yourApp-api. Upon success you will have BuildConfig and ImageStream.

The ImageStream is used to host the docker image in openshift registry and point to different build tags: latest, dev, etc.

The Deployment config will reference these builds using the tags

The BuildConfig is run to manually build a docker image and push it to the openshift registry

### Role Binding
You need to give the service account "default" image pulling permissions. Create an image pulling role and bind it to the default service account

### Network Policy

The tools namespace will be common to dev, test and prod and you will need to allow for connections between namespaces via Network policy:

You need a policy to allow pods in xxxx-dev to connect with each other
    spec:
    
    podSelector: {}
    
    ingress:
    
    - from:
    
    - namespaceSelector:
    
    matchLabels:
    
    environment: dev
    
    name: c8b80a
    
    policyTypes:
    
    - Ingress


# Github Workflows

## Image tags and promotion

One image is built per merge and then promoted; nothing is rebuilt on the way to prod, so the
bytes that ship to prod are the bytes that were tested.

    develop merge  ->  api-cd / web-cd  ->  :latest        (rolls c8b80a-dev)
    Deploy (test)  ->  oc tag :latest :test               (rolls c8b80a-test)
    Deploy (prod)  ->  oc tag :test   :prod               (rolls c8b80a-prod)

Three tags, one per environment: **`:latest` is dev** - the same convention as the other EPIC
repos - then `:test` and `:prod`. `api-cd.yml` and `web-cd.yml` build on a push to `develop` and
only ever write `:latest`; they take no environment input, so there is no path that builds
straight into test or prod. `deploy.yml` is the only way into test and prod: it moves an
existing tag and never builds.

Because the workloads are Deployments with no ImageChange trigger, moving a tag does not roll
anything by itself. Every workflow ends with `oc rollout restart deployment/<name>` followed by
`oc rollout status`.

## Rolling prod back

A prod deploy first points a dated tag at whatever `:prod` names at that moment, so the previous
image is always still addressable:

    oc get istag -n c8b80a-tools | grep prod-backup

To go back, move `:prod` onto one of those and restart - no rebuild, no branch, no waiting on CI:

    oc project c8b80a-tools
    oc tag map-api:prod-backup-20260914-183000 map-api:prod
    oc tag map-web:prod-backup-20260914-183000 map-web:prod
    oc rollout restart deployment/map-api -n c8b80a-prod
    oc rollout restart deployment/map-web -n c8b80a-prod

A rollback does **not** undo a database migration - `pre-hook-update-db.sh` has already run
against prod by then, and the older image may not understand the newer schema. Check what the
promotion migrated before rolling back across one.

Backup tags accumulate, one pair per prod deploy. Prune old ones when they get noisy:

    oc delete istag map-api:prod-backup-20260914-183000 -n c8b80a-tools

## Setup

- create a github-action service account openshift in the tools namespace and bind to it image puller and image pusher roles
- Add the following secrets in the repo settings under repository secrets: OPENSHIFT_IMAGE_REGISTRY (the public image repository, ignore the path just the base  url), OPENSHIFT_LOGIN_REGISTRY (you can pull this from the same place you get your oc login command, OPENSHIFT_REPOSITORY, OPENSHIFT_SA_NAME (github_action), OPENSHIFT_SA_TOKEN(github-action token, find it in secrets)

# Codecov
if you intend to use codecov in your CI workflows, you have to go to the bcgov codecov account and register your app there, get a token and add it as a repo secret with name CODECOV_TOKEN

### JEST
example work yml for jest:

  testing:
    needs: setup-job
    runs-on: ubuntu-20.04

    steps:
      - uses: actions/checkout@v3
    
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v1
        with:
          node-version: ${{ matrix.node-version }}
    
      - name: Install dependencies
        run: |
          npm install --legacy-peer-deps
        env:
          FONTAWESOME_PACKAGE_TOKEN: ${{ secrets.FONTAWESOME_PACKAGE_TOKEN }}
    
      - name: Test with jest
        id: test
        run: |
          npm test -- --coverage
    
      # Set codecov branch name with prefix if pull request
      - name: Sets Codecov branch name
        run: |
          echo "CODECOV_BRANCH=PR_${{github.head_ref}}" >> $GITHUB_ENV
        if: github.event_name == 'pull_request'
    
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          flags: app-web
          name: codecov-app-web
          fail_ci_if_error: true
          verbose: true
          override_branch: ${{env.CODECOV_BRANCH}}
          token: ${{ secrets.CODECOV_TOKEN }}
### Cypress
you have to add a some dev dependencies and set them up in the app and then you can use the below example yml for cypress:

      testing:
        needs: setup-job
        runs-on: ubuntu-20.04
    
        steps:
          - uses: actions/checkout@v2
    
          - name: Use Node.js ${{ matrix.node-version }}
            uses: actions/setup-node@v1
            with:
              node-version: ${{ matrix.node-version }}
    
          - name: Install dependencies
            run: |
              npm install --legacy-peer-deps
    
          - name: Test with Cypress
            id: test
            run: |
              npx cypress run --component --headed --browser chrome
    
          - name: Sets Codecov branch name
            run: |
              echo "CODECOV_BRANCH=PR_${{ github.head_ref }}" >> $GITHUB_ENV
            if: github.event_name == 'pull_request'
    
          - name: Upload coverage to Codecov
            uses: codecov/codecov-action@v4
            with:
              flags: app-web
              name: codecov-app-web
              fail_ci_if_error: true
              verbose: true
              override_branch: ${{ env.CODECOV_BRANCH }}
              token: ${{ secrets.CODECOV_TOKEN }}
              directory: ./app-web/coverage


