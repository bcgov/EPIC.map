# OpenShift resources outside the charts

Everything in `deployment/charts` is safe to publish. Anything with a real credential in it is
created directly in the namespace instead and referenced by name, because **this repo is
public**. The files here are templates with placeholders, the same pattern EPIC.engage uses in
its `openshift/*.secret.yml`.

## Where each secret comes from

| Secret | Created by | Holds |
|---|---|---|
| `map-api-secrets` | **you, by hand** - see below | `SECRET_KEY` |
| `map-db-pguser-map-db` | the Crunchy operator, on install | `user`, `password`, `dbname`, `host`, `port`, `uri` |
| `map-redis` | the `map-redis` chart, on first install | `REDIS_PASSWORD`, `REDIS_URL` |

Only the first is a value a human has to know. The other two are generated in the cluster on
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
