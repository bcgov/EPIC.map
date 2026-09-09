# "build-stage", based on Node.js, to build and compile the frontend
#
# The build context is the REPOSITORY ROOT, not map-web/:
#
#   docker build . --file map-web/Dockerfile
#
# map-web depends on @bcgov/epic-map, which is a workspace sibling rather than
# a published dependency it can fetch. Building with map-web/ as the context
# leaves npm trying to resolve it from the registry, where it is private.
FROM node:24-alpine as build-stage

# set working directory
WORKDIR /app

# add `/app/node_modules/.bin` to $PATH
ENV PATH /app/node_modules/.bin:$PATH

# install app dependencies
#
# Manifests only, so the install layer is cached until a dependency actually
# changes. Every workspace's package.json has to be present or `npm ci` refuses
# the lockfile as out of sync.
COPY package.json package-lock.json ./
COPY map-web/package.json ./map-web/
COPY packages/epic-map/package.json ./packages/epic-map/

RUN npm ci

# create and set user permissions to app folder
RUN mkdir -p node_modules/.cache && chmod -R 777 node_modules/.cache

# add app files
COPY packages/epic-map ./packages/epic-map
COPY map-web ./map-web

# The widget first: map-web resolves @bcgov/epic-map to its built dist/, which
# npm ci links but does not build.
RUN npm run build --workspace @bcgov/epic-map
RUN npm run build --workspace map-web

# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1.17 as production-stage
RUN mkdir /app

# RUN  touch /var/run/nginx.pid && \
#     chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid

# ARG user=nginx
# RUN usermod -a -G root $user

COPY --from=build-stage /app/map-web/dist /usr/share/nginx/html
COPY map-web/nginx/nginx.conf /etc/nginx/

# Set ownership and permissions
# Set scripts as executable (make files and python files do not have to be marked)
# Make /etc/passwd writable for the root group so an entry can be created for an OpenShift assigned user account.
# RUN chown -R $user:root /etc/nginx/ \
#     && chmod -R ug+rw /etc/nginx/ \
#     && chmod ug+x docker-entrypoint.sh \
#     && chmod g+rw /etc/passwd

# USER $user
EXPOSE 8081:8081
CMD ["nginx", "-g", "daemon off;"]
