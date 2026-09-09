# EPIC.map

EPIC.map is three things in one repository: a standalone API, a React component published to npm,
and a web app that hosts the component during development.

## Repository layout

| Path | What it is | Published? |
| --- | --- | --- |
| `map-api/` | Flask API and its database. A standalone service, deployed on its own — unaffected by the split below. | Deployed as a service |
| `packages/epic-map/` | **The product.** The embeddable React component (`@bcgov/epic-map` on npm) that other EPIC applications install and render. | **Yes — this is the npm package** |
| `map-web/` | The development harness and reference implementation. Runs the component locally against `map-api`, and shows host teams how to mount, theme and authenticate it. | No (`private: true`) |

`packages/epic-map` and `map-web` are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
declared in the root `package.json`, so `map-web` resolves `@bcgov/epic-map` from the local source
rather than the registry — changes to the component show up in the harness immediately.

### Why map-web still exists

`map-web` is not legacy and is not scheduled for deletion. It is where the widget is developed, and
it is the reference host that other EPIC teams copy from when embedding `epic.map`. Anything that
belongs to the *application* rather than the *component* — routing, the auth provider, the query
client, environment configuration — lives here on purpose.

### Releasing the widget

`@bcgov/epic-map` is **semver-versioned independently of map-api**. The two ship on
separate schedules and their version numbers say nothing about each other — a major
bump of the widget implies nothing about which API version you are running, and vice
versa. Compatibility with the API is a property of the endpoints the widget calls,
and breaking that is a breaking change to the widget's own major version.

Versions are managed with [changesets](https://github.com/changesets/changesets):

```bash
npm run changeset          # describe your change; commit the file it writes
npm run version-packages   # applies pending changesets: bumps version, writes CHANGELOG
```

Publishing happens only from a tag, never from a merge to `main` — host applications
pin a version and upgrade when they choose:

```bash
git tag epic-map-v0.1.0 && git push origin epic-map-v0.1.0
```

That fires `.github/workflows/widget-publish.yml`, which lints, typechecks, builds,
refuses to continue if the tag disagrees with `package.json`, attests build
provenance for the tarball, and publishes to GitHub Packages.

### Current state

The restructure is in progress. The package builds and publishes (Vite library mode, ESM only, type
declarations via `vite-plugin-dts`), and `map-web` now consumes it: `/map` renders `<MapWidget>` from
the workspace and supplies the API url and the token.

The map UI that existed in `map-web` — the search bar, the filter buttons and the map surface — has
moved into `packages/epic-map/src`. The map itself is still a placeholder; maplibre is wired as a
dependency but nothing renders through it yet.

Two contracts are already enforced there, and are worth knowing before moving code across:

- **Configuration is by props only.** The widget never reads `import.meta.env`; a published artifact
  would otherwise carry our build-time environment into every host. An ESLint rule blocks it.
- **The widget does no authentication.** No `keycloak-js`, no `react-oidc-context`. The host owns
  the session; `map-web` shows how.

[`packages/epic-map/README.md`](packages/epic-map/README.md) is the integration guide host teams
read. Its "What the widget does not do" section is the short form of the reasoning — why the widget
is a package rather than an iframe, why it holds no auth, and why entitlement stays server-side — and
[`packages/epic-map/.eslintrc.cjs`](packages/epic-map/.eslintrc.cjs) is where those rules are
enforced.

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
From the repository root — this installs `map-web` and `packages/epic-map` together and links them:

    npm install

### 2. Build the Widget Package
`map-web` resolves `@bcgov/epic-map` to the package's built `dist/`, and `npm install` only links the
workspace — it does not build it. On a fresh clone `dist/` does not exist yet, so build it once from
the repository root:

    npm run build --workspace @bcgov/epic-map

Skipping this fails the dev server with `Failed to resolve entry for package "@bcgov/epic-map"`. The
same applies after any `git clean -xdf`, since `dist/` is build output and is not committed. See
[Working on the widget](map-web/README.md#working-on-the-widget) for how to keep it up to date while
editing widget source.

### 3. Navigate to Front End Directory
Change to the harness directory:

    cd map-web

### 4. Configure Environment Variables
Copy `sample.env` to `.env` and fill in the values. At a minimum set `VITE_API_URL` to the map-api
url including the `/api` prefix (e.g. `http://localhost:5000/api`), and `VITE_APP_URL` to the address
the dev server actually serves on — the OIDC redirect URIs are derived from it.

### 5. Run Development Server
Launch the development server:

    npm run dev

It serves on Vite's default port, http://localhost:5173. The port is not pinned in `vite.config.ts`,
so if you change it, keep `VITE_APP_URL` in step 4 in step with it and make sure the origin is in the
api's allowed list — `CORS_ORIGIN`, or the `LOCAL_CORS_ORIGINS` fallback in
[`map-api/src/map_api/config.py`](map-api/src/map_api/config.py), which covers 5173, 3000 and 8000.

### 6. Editing the Widget While the Host Runs
`npm run dev` serves the host against the package's prebuilt `dist/`, so edits under
`packages/epic-map/src` do not reach the browser on their own. Pick one of the two loops, both run
from the repository root:

Run the package's watch build in a second terminal, so every widget edit rebuilds `dist/` and the
host reloads:

    npm run dev:widget-watch    # packages/epic-map: vite build --watch
    npm run dev                 # in another terminal

Or run the host in source mode, which aliases `@bcgov/epic-map` to `packages/epic-map/src` and gives
HMR with no build step at all:

    npm run dev:widget-source

Source mode is the faster loop but compiles the widget with the host's Vite config instead of the
library build, so verify anything build-shaped — the emitted types, `dist/epic-map.css`, the
externals — with the watch build before opening a PR.

See `map-web/README.md` for the full front end documentation, and
[`packages/epic-map/README.md`](packages/epic-map/README.md) for the component package.

# Helm
In openshift, you should have namespaces as such:
xxxx-tools
xxxx-dev
xxxx-test
xxxx-prod

After the oc login which can be gotten from the openshift command line tool page
install command https://helm.sh/docs/helm/helm_install/

## Patroni
You can reuse a patroni chart like https://github.com/bcgov/nr-patroni-chart
follow instructions on the link

- if the resource quota was exceeded you can change the values in values.yaml, you can always do that locally and install like this as well `$ helm install -f myvalues.yaml myredis ./redis`

## API

can reuse the charts here https://github.com/bcgov/EPIC.submit/tree/develop/deployment/charts the api and the api-bc

### *api.yml
Install it in the xxxx-dev with name xxx-api. Upon success you will have the DeploymentConfig, Route, Service, Secrets and ConfigMap

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
you can find a working example here: https://github.com/bcgov/EPIC.map/tree/main/.github/workflows

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


