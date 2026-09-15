# map-database

Postgres 16 + PostGIS 3.4 for EPIC.map, deployed as a `PostgresCluster` managed by the
Crunchy Postgres Operator (PGO) that Platform Services runs on the cluster. This chart is a
thin wrapper: all of the templates come from the BC Gov
[crunchy-postgres](https://github.com/bcgov/crunchy-postgres) chart, pinned in `Chart.yaml`,
and this repo owns only the values.

## Why Crunchy and not Patroni

- `postGISVersion: '3.4'` selects a prebuilt PostGIS image from the BC Gov artifactory - the
  operator picks the tag, `crunchy-postgres-gis:ubi8-16.11-3.4-2547` under operator 5.8.5. The standalone Patroni chart this replaced pinned Postgres 12
  with no PostGIS, so it would have needed a custom image built and maintained in `-tools`.
- PGO runs `CREATE EXTENSION IF NOT EXISTS postgis` (plus `postgis_topology`,
  `fuzzystrmatch`, `postgis_tiger_geocoder`) in every database **as superuser** on reconcile.
  `migrations/versions/3b1c7a04f9d2` issues the same statement as the application role, which
  is not a superuser - it succeeds only because the extension is already there.
- Backups, PITR and connection pooling are configuration here rather than code we own, and
  the operator itself is maintained by Platform Services.

## What gets created

One `PostgresCluster` named `map-db`, from which the operator derives:

| Object | Name |
|---|---|
| App credentials secret | `map-db-pguser-map-db` |
| Superuser secret | `map-db-pguser-postgres` |
| Primary service | `map-db-primary` |
| pgBouncer service | `map-db-pgbouncer` (what `map-api` connects to) |
| Instance pods | `map-db-ha-*`, one per `instances.replicas` |
| Backup repo host | `map-db-repo-host-0` |

The app secret carries `user`, `password`, `dbname`, `host`, `port`, `uri`, `jdbc-uri` and the
`pgbouncer-*` equivalents - **not** the `app-db-*` keys the old Patroni chart used. `map-api`'s
chart reads `user` / `password` / `dbname` from it.

The role, the database and the secret are all named from `fullnameOverride`. Changing it
changes the database name, so keep it in step with `database.secret` in `deployment/charts/map-api/values.yaml`.

## Database ownership

PGO creates the database as the `postgres` superuser and grants the application role
database-level privileges only. Since Postgres 15 that is not enough to create a table: schema
`public` is owned by `pg_database_owner`, so `CREATE` there belongs to whoever owns the
database. Without a fix, `map-api`'s first migration dies on
`permission denied for schema public`.

A post-install/post-upgrade Helm hook (`templates/db-owner-job.yaml`) runs
`ALTER DATABASE map-db OWNER TO map-db` as the superuser. It waits for the cluster to accept
connections, is idempotent, and re-runs on upgrades because a cluster restored from backup
comes back owned by `postgres`.

To do it by hand - on a cluster that predates the hook, for instance:

    oc exec -n c8b80a-dev -c database $(oc get pod -n c8b80a-dev \
      -l postgres-operator.crunchydata.com/cluster=map-db,postgres-operator.crunchydata.com/role=master \
      -o name) -- psql -c 'ALTER DATABASE "map-db" OWNER TO "map-db";'

## Install

Confirm the operator is available in the namespace first - without it the `PostgresCluster`
applies but nothing happens:

    oc project c8b80a-dev
    oc api-resources | grep postgrescluster

Check that a same-namespace network policy is in place. PGO needs the instance pods, the
repo host and pgBouncer to reach each other, and `map-api` needs to reach pgBouncer; a
default-deny namespace with no `allow-same-namespace` policy breaks both. `c8b80a-dev`
already runs Compliance and Track, so one is almost certainly there - confirm rather than
add a second:

    oc get networkpolicy -n c8b80a-dev

Then:

    helm dependency update .
    helm upgrade --install map-db . -f values.yaml -f values.dev.yaml -n c8b80a-dev

Test and prod are the same command with `values.test.yaml` / `values.prod.yaml` and the
matching namespace. `values.yaml` holds everything common; the per-environment files carry
sizing only.

## Verify

    oc get postgrescluster map-db -n c8b80a-dev
    oc get pods -l postgres-operator.crunchydata.com/cluster=map-db -n c8b80a-dev

PostGIS, from the primary pod:

    oc exec -it -n c8b80a-dev $(oc get pod -n c8b80a-dev \
      -l postgres-operator.crunchydata.com/cluster=map-db,postgres-operator.crunchydata.com/role=master \
      -o name) -c database -- psql -d map-db -c "SELECT postgis_full_version();"

## Environments

| | dev | test | prod |
|---|---|---|---|
| Instances | 1 | 2 | 3 |
| Data volume | 2Gi | 5Gi | 20Gi |
| Backup volume | 2Gi | 5Gi | 20Gi |
| Full backups kept | 2 | 7 | 30 |
| pgBouncer replicas | 1 | 2 | 2 |

`c8b80a` is shared with Compliance and Track, so dev deliberately runs a single instance:
there is no failover to rehearse there, and the quota is not ours alone.

## Known gaps

- Prod backups are PVC-only (`repo1`). S3 (`repo2`) should be enabled before go-live so a lost
  namespace does not take the backups with it - see `pgBackRest.s3` in the upstream values.
- The upstream chart's pgBouncer anti-affinity matches on the instance-set name rather than
  the cluster name, so the preference never matches. Harmless, and upstream's to fix.
