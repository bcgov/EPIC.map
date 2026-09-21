# "build-stage", based on Node.js, to build and compile the frontend
#
# The build context is the REPOSITORY ROOT, not map-web/:
#
#   docker build . --file map-web/Dockerfile
#
# map-web is an npm workspace and resolves its dependencies from the single
# lockfile at the root, so building with map-web/ as the context leaves npm with
# no lockfile to install from.
#
# Note what is NOT copied in: packages/epic-map. The map is a Module Federation
# remote now — it is fetched over HTTP at runtime from the origin in
# VITE_MAP_WIDGET_URL, not compiled into this image. Only its type package is
# needed, and only so tsc has a contract to check the map route against.
FROM node:24-alpine AS build-stage

# set working directory
WORKDIR /app

# add `/app/node_modules/.bin` to $PATH
ENV PATH=/app/node_modules/.bin:$PATH

# install app dependencies
#
# Manifests only, so the install layer is cached until a dependency actually
# changes. Every workspace's package.json has to be present or `npm ci` refuses
# the lockfile as out of sync.
COPY package.json package-lock.json ./
COPY map-web/package.json ./map-web/
COPY packages/epic-map/package.json ./packages/epic-map/
COPY packages/epic-map-types/package.json ./packages/epic-map-types/

RUN npm ci

# create and set user permissions to app folder
RUN mkdir -p node_modules/.cache && chmod -R 777 node_modules/.cache

# add app files
COPY packages/epic-map-types ./packages/epic-map-types
COPY map-web ./map-web

RUN npm run build --workspace map-web

# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1.17 AS production-stage
RUN mkdir /app

COPY --from=build-stage /app/map-web/dist /usr/share/nginx/html
COPY map-web/nginx/nginx.conf /etc/nginx/

EXPOSE 8081:8081
CMD ["nginx", "-g", "daemon off;"]
