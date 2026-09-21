# The EPIC map, built as a Module Federation remote and served as static files.
#
# The build context is the REPOSITORY ROOT, not packages/epic-map/:
#
#   docker build . --file packages/epic-map/Dockerfile
#
# The package is an npm workspace and resolves its dependencies from the single
# lockfile at the root, so building with packages/epic-map/ as the context
# leaves npm with no lockfile to install from.
FROM node:24-alpine AS build-stage

WORKDIR /app

ENV PATH=/app/node_modules/.bin:$PATH

# Manifests only, so the install layer is cached until a dependency actually
# changes. Every workspace's package.json has to be present or `npm ci` refuses
# the lockfile as out of sync - map-web's included, even though nothing of it is
# built here.
COPY package.json package-lock.json ./
COPY packages/epic-map/package.json ./packages/epic-map/
COPY packages/epic-map-types/package.json ./packages/epic-map-types/
COPY map-web/package.json ./map-web/

RUN npm ci

COPY packages/epic-map-types ./packages/epic-map-types
COPY packages/epic-map ./packages/epic-map

RUN npm run build --workspace @bcgov/epic-map

FROM nginx:1.27-alpine AS production-stage

COPY --from=build-stage /app/packages/epic-map/dist /usr/share/nginx/html
COPY packages/epic-map/nginx/nginx.conf /etc/nginx/nginx.conf

# Fail the build on a bad config rather than the rollout. Without this the first
# sign of a syntax error is a pod in CrashLoopBackOff after the image has already
# been pushed and promoted.
#
# One warning is expected and is not a failure: `duplicate extension "ts"` is the
# mime override that makes the served contract readable. See nginx.conf.
#
# The check runs as root and leaves a root-owned pid file and temp dirs in /tmp,
# which OpenShift's arbitrary uid then cannot write, so clear them.
RUN nginx -t && rm -rf /tmp/*

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
