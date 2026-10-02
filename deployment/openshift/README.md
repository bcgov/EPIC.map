# OpenShift resources outside the charts

Everything in `deployment/charts` is safe to publish. Anything with a real credential in it is
created directly in the namespace instead and referenced by name, because **this repo is
public**. The files here are templates with placeholders, the same pattern EPIC.engage uses in
its `openshift/*.secret.yml`.

## Where each secret comes from

| Secret | Created by | Holds |
|---|---|---|
| `map-api-secrets` | **you, by hand** - see below | `SECRET_KEY` |
| `map-ingest-s3` | **you, by hand** - see below | `S3_BUCKET`, `S3_HOST`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| `map-db-pguser-map-db` | the Crunchy operator, on install | `user`, `password`, `dbname`, `host`, `port`, `uri` |
| `map-redis` | the `map-redis` chart, on first install | `REDIS_PASSWORD`, `REDIS_URL` |

Only the first two are values a human has to know. The other two are generated in the cluster on
install and never pass through git, a values file, or a CI log - which is why neither chart
takes a password as a value.

`map-api`'s chart pulls all three in with `envFrom`, so adding a key to a secret reaches the
API on the next rollout with no chart change.

## Creating `map-api-secrets`

Once per namespace, before the first `map-api` install:

    oc project c8b80a-dev
    oc create secret generic map-api-secrets \
      --from-literal=SECRET_KEY="$(openssl rand -hex 32)"

Use a different value in each of dev, test and prod. To rotate it, replace the secret and roll
the deployment - a running pod holds the old value until it restarts:

    oc create secret generic map-api-secrets \
      --from-literal=SECRET_KEY="$(openssl rand -hex 32)" \
      --dry-run=client -o yaml | oc replace -f -
    oc rollout restart deployment/map-api

## Creating `map-ingest-s3`

Once per namespace, before setting `ingest.enabled: true` for that environment. EAO's GIS team
supplies the bucket, host and keys; the object *keys* are not here - they are fixed per layer in
`map-api/src/map_api/services/local_layer_service/ingest_spec.py`, so moving a delivery is a
reviewed change rather than an environment variable.

    oc project c8b80a-dev
    oc create secret generic map-ingest-s3 \
      --from-literal=S3_BUCKET=... \
      --from-literal=S3_HOST=... \
      --from-literal=S3_REGION=us-east-1 \
      --from-literal=S3_ACCESS_KEY_ID=... \
      --from-literal=S3_SECRET_ACCESS_KEY=...

`S3_HOST` is a hostname with no scheme; `config.s3_endpoint` assumes https. To rotate:

    oc create secret generic map-ingest-s3 --from-literal=... \
      --dry-run=client -o yaml | oc replace -f -

No rollout is needed - nothing holds these open, and the next scheduled Job reads the new values.

`S3_BUCKET` and `S3_HOST` are not credentials, and the rule below says non-secret configuration
belongs in a values file. They are here anyway, deliberately: those files are public, and this
keeps one object to create and one to rotate.

Because the bucket is in the secret rather than the chart, each namespace can read a different
one with no chart change - so dev and test do not have to share a delivery, and asking the
storage team for a per-environment key costs nothing here.

## Turning the ingest on in a namespace

Four things, in this order. The ordering is the part that bites: the CronJob reads tables that
the migration creates, and the migration runs in the API's own pre-hook.

**1. `c8b80a-tools`, once for the whole cluster.** The ingest image needs an ImageStream:

    helm upgrade --install map-api-ingest-bc charts/map-api-ingest.bc -n c8b80a-tools

Pushing to the integrated registry would auto-create the stream, but `deploy.yml` tags istags by
name and every other image here has a chart, so this keeps the convention. **No RBAC to add** -
`image-puller.rolebinding.yml` binds `system:image-puller` on the whole `c8b80a-tools` namespace
for the dev, test and prod default service accounts, which already covers a new stream.

**2. Deploy `map-api` itself from a build that includes the ingest work.** The Deployment's
`pre-hook` initContainer runs `flask db upgrade`, which is what creates the `cache` schema,
`cache.pip_consultation_areas`, `cache.local_layer_loads` and `cache.local_layer_styles`. A
CronJob that runs before that exits 2 on a missing table - correctly, but confusingly.

**3. Create `map-ingest-s3`** in that namespace, as above.

**4. Check the pod will schedule, then enable it.** `ingest.enabled` is `false` in `values.yaml`
and `true` only in `values.dev.yaml`. For another environment, add to its values file:

    ingest:
      enabled: true

The image tag follows `image.tag`, so test runs `map-api-ingest:test` without naming it twice -
but `deploy.yml` does not tag that stream yet. Promoting to test needs a line beside the others:

    oc tag map-api-ingest:$SOURCE_TAG map-api-ingest:$ENV

Without it, `map-api-ingest:test` never exists and the CronJob's pods sit `ImagePullBackOff`.

Also confirm the cluster is **OCP 4.14 or newer** (`oc version`). The CronJob sets
`timeZone: Etc/UTC`, which needs Kubernetes 1.27+; on anything older set `ingest.timeZone: ""`.
The schedule means the same thing either way, because the control plane runs UTC.

## The ingest CronJob

`map-api`'s chart creates a `map-api-ingest` CronJob when `ingest.enabled` is true - dev only for
now. It runs a **second image**, `map-api-ingest`, built from `map-api/Dockerfile.ingest` because
the load needs GDAL and the API pod has no use for it. `.github/workflows/api-cd.yml` builds and
pushes both; `charts/map-api-ingest.bc` holds its BuildConfig and ImageStream.

    oc get cronjob map-api-ingest -n c8b80a-dev
    oc get jobs -l app=map-api-ingest -n c8b80a-dev
    oc create job --from=cronjob/map-api-ingest ingest-manual-1 -n c8b80a-dev   # run it now
    oc logs -f job/ingest-manual-1 -n c8b80a-dev

It is built to fail visibly rather than quietly: one attempt, no retries, and finished Jobs are
kept rather than expired, so a **Failed** Job in the namespace is the alert. Exit 1 means an
extract was refused and the previous layer is still being served - look at the file. Exit 2 means
the ingest could not run - look at us. Every attempt, including both of those, writes a row:

    select status, source_name, area_count, loaded_date, notes
    from cache.local_layer_loads order by loaded_date desc limit 5;

Before enabling it in a new namespace, check the pod will schedule - a Pending Job is only
"loud" an hour later, when its deadline expires:

    oc describe quota -n c8b80a-dev

## Image pulling

`map-api` and `map-web` are Deployments that name the image by its full registry path
(`image-registry.openshift-image-registry.svc:5000/c8b80a-tools/map-api:latest` in dev), so the `default`
service account in each environment namespace needs to be able to pull from `-tools`. Apply
`image-puller.rolebinding.yml` once, in the tools namespace:

    oc apply -f image-puller.rolebinding.yml -n c8b80a-tools

## Migrating off DeploymentConfigs

`map-api` and `map-web` were DeploymentConfigs until this change. In any namespace where the
old objects already exist, delete them before installing the charts - otherwise both a DC and a
Deployment manage pods for the same Service and you get two sets:

    oc delete dc/map-api dc/map-web -n c8b80a-dev

A DeploymentConfig rolled itself when its ImageStream tag moved. A Deployment does not, and the
chart's image reference does not change when a tag is re-pushed, so CI now ends with an explicit
`oc rollout restart deployment/<name>` - see `.github/workflows/`.

## Non-secret configuration

Everything that is not a credential lives in the charts' per-environment values files
(`values.dev.yaml`, `values.test.yaml`, `values.prod.yaml`) and renders into a ConfigMap:
CORS origins, allowed Keycloak client ids, the required group, issuer and well-known URLs.
Those are safe to read, review in a PR, and diff between environments - keep them there rather
than in a secret.
