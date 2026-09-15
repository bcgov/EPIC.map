# map-redis

Redis 7 for `map-api`: the DataBC CKAN catalogue index and layer registry lookups. It runs as
its own Deployment and Service in the namespace - a separate pod, not a sidecar on `map-api`.

## Why a separate pod

- The cache has to be **shared**. A sidecar gives every `map-api` replica its own cache, so a
  scale-up multiplies the calls out to DataBC instead of amortizing them, and two replicas can
  disagree about what the catalogue currently says.
- It restarts on its own schedule. A cache eviction shouldn't take the API down with it, and an
  API rollout shouldn't cold-start the cache.
- Redis is not optional in a deployed environment. `map-api`'s liveness probe hits `/ops/healthz`,
  which returns **503** when Redis fails to answer `PING` - with no Redis, kubelet restarts the
  API pod on a loop.

## Why a plain Deployment

`map-api` and `map-web` are Deployments built in `-tools` and restarted by CI after a tag moves.
Redis is an upstream image pulled straight from Artifactory with nothing to build and nothing to
promote, so it needs none of that.

The image comes through the BC Gov Artifactory Docker Hub mirror
(`artifacts.developer.gov.bc.ca/docker-remote/redis`). The platform's cluster-wide pull secrets
cover the remote/caching repositories, so no `imagePullSecrets` and no Docker Hub rate limit.

## Cache, not a datastore

`save ""` and `appendonly no` - nothing is persisted, `/data` is an `emptyDir`, and the
catalogue rewarms from DataBC after a restart. `maxmemory` with `allkeys-lru` keeps it inside
the container limit rather than letting the OOM killer decide.

`replicas` is 1 and should stay there. Two pods behind one Service are two independent caches,
and `map-api` would hit whichever one it landed on.

## Password

The chart generates a 32-character password on first install and, on every `helm upgrade`,
reads back the one already in the cluster rather than rotating it out from under `map-api`.
`c8b80a` is shared with Compliance and Track, so "inside the namespace" is not by itself a
trust boundary worth leaning on - which is the same reason the database keeps `md5` in its
`pg_hba` rather than `trust`.

The secret `map-redis` holds `REDIS_PASSWORD` and the full `REDIS_URL`. `map-api` reads
`REDIS_URL`, which `config.py` prefers over the `REDIS_HOST`/`PORT`/`DB` parts. Nothing about
the password is in git.

## Install

    cd deployment/charts/map-redis
    helm upgrade --install map-redis . -f values.yaml -f values.dev.yaml -n c8b80a-dev

Test and prod are the same command with `values.test.yaml` / `values.prod.yaml`.

## Verify

    oc get pods -l app=map-redis -n c8b80a-dev
    oc exec -n c8b80a-dev deploy/map-redis -- \
      sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping'

End to end, once `map-api` is up - `redis` should read `ok`:

    oc exec -n c8b80a-dev deploy/map-api -- curl -s localhost:8080/ops/healthz

## Environments

| | dev | test | prod |
|---|---|---|---|
| maxmemory | 128mb | 256mb | 512mb |
| Memory limit | 256Mi | 512Mi | 1Gi |
| CPU limit | 100m | 250m | 500m |
