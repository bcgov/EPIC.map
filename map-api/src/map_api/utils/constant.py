# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Constants."""

import os

from .enum import PermissionEnum


# The application's name in the shared EAO Keycloak realm. Used as the default
# value of AUTH_REQUIRED_GROUP when group gating is switched on.
AUTH_APP = 'MAP'

# What a signed-in user can do before any Keycloak role says otherwise. Roles
# are still to be decided, so every authenticated IDIR user is a plain user;
# any client role the token does carry is added on top of this.
DEFAULT_PERMISSIONS = (PermissionEnum.USER,)

# PermissionEnum -> the Keycloak client role that grants it.
GROUP_MAP = {
    PermissionEnum.SUPERUSER: 'super_user',
    PermissionEnum.ADMIN: 'admin',
    PermissionEnum.USER: 'user',
    PermissionEnum.VIEWER: 'viewer',
}

# Where an applied layer came from. Only the bc catalogue is written currently.
LAYER_SOURCE_BCDC = 'bcdc'

# Opacity is stored as a percentage rather than a fraction.
DEFAULT_LAYER_OPACITY = 100
MIN_LAYER_OPACITY = 0
MAX_LAYER_OPACITY = 100

# Max layers per map for performance
MAX_APPLIED_LAYERS_PER_MAP = 50

# A BCGW object name, e.g. WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES. Excludes
# ':' (smuggling another namespace past the client's 'pub:' prefix), ',' (many
# layers in one LAYERS=) and '/?#%' and whitespace (escaping the parameter, or
# the path segment of an outbound URL).
OBJECT_NAME_PATTERN = r'^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'

# BCGW's public OWS endpoint for one warehouse object. Only ever formatted with
# an object name the schema has already validated - the path segment is what
# stops a crafted name addressing another host.
BCGW_OWS_URL = 'https://openmaps.gov.bc.ca/geo/pub/{object_name}/ows'

# WFS over a province-wide table is not always quick, but a user is watching a
# button, so this gives up well before they do. Measured hops run 0.1-1.0s, so
# this is roughly eight times the worst observed - generous without being the
# kind of number that lets one slow layer own a worker thread.
BCGW_WFS_TIMEOUT_SECONDS = 8

# Half-widths, in degrees, of the windows searched outwards from the user for a
# feature to zoom to. The last is most of the province: past that, "near you"
# has stopped meaning anything and the first feature is as good an answer.
NEAREST_SEARCH_WINDOWS_DEGREES = (0.5, 2.0, 8.0, 32.0)

# Entries the in-process cache will hold before it starts evicting the oldest.
# flask-caching defaults to 500, which the nearest-feature answers alone can
# fill: one per layer per quarter-degree of map, and an evicted entry costs
# another second of the BCGW's time. Each entry is a handful of floats, so tens
# of thousands would still be a rounding error against the pod's memory limit.
CACHE_ENTRY_LIMIT = 5000

# How long a found feature is worth remembering. Warehouse geometry is revised
# on a scale of months, and a stale box only sends the user somewhere the layer
# used to be - so this leans long, which is what keeps the BCGW call rare.
NEAREST_CACHE_TTL_SECONDS = 24 * 60 * 60

# Callers are bucketed to this many degrees before the cache is consulted, so
# two users looking at roughly the same place share an answer instead of each
# missing on their own exact centre. Roughly 28 km of latitude - well inside the
# smallest search window, so the bucket cannot change which window wins.
NEAREST_CACHE_PRECISION_DEGREES = 0.25

# British Columbia as [west, south, east, north] - the same box the widget opens
# on. The last resort of the nearest-feature search, for a layer whose features
# are all elsewhere and too heavy to measure: somewhere in the province is a
# poor answer, but it is the honest one and it beats a dead button.
BC_EXTENT = (-139.1, 48.2, -114.0, 60.1)

# Bytes of feature geometry this pod will carry before it stops reading. A
# single BCGW polygon can run past half a megabyte of coordinates - watershed
# groups do - and decompressing and parsing that holds the GIL on a quarter of a
# core, stalling every other request in the process. Past this the search window
# frames the camera instead, which costs the user a little zoom and nothing else.
# Set well above the few kilobytes a feature of a zoomable layer actually weighs,
# so this bounds the tail rather than shaping the common answer.
NEAREST_GEOMETRY_BYTE_LIMIT = 128 * 1024

# Bytes of a capabilities document this pod will carry. Separate from the
# geometry cap because the two failures are not alike: a feature too big to
# carry has the search window to fall back on, whereas a capabilities document
# cut short has no floor in it to read, and reading that as "declares no limit"
# is the exact fault the min-zoom endpoint exists to remove. Measured per-object
# documents run 15-19KB, so this is an order of magnitude of headroom and only
# ever trips on something that has gone wrong upstream.
BCGW_CAPABILITIES_BYTE_LIMIT = 256 * 1024

# Read granularity for the capped read above: large enough not to loop per
# packet, small enough to notice the cap before much past it.
BCGW_READ_CHUNK_BYTES = 32 * 1024

# Wall clock a whole widening search may spend on the warehouse before it stops
# widening. The per-request timeout bounds one hop; this bounds the sequence, so
# a slow layer cannot hold a worker thread for a multiple of it.
#
# The budget is checked between hops, so the true ceiling is this plus the hop
# that crosses it plus the unfiltered fallback: 8 + 8 + 8 at the timeout above,
# which holds only because that timeout is enforced against the clock for the
# whole of a hop rather than per read. See `_read`.
# That has to stay under gunicorn's 30 second default, which does not fail one
# request - it kills the worker, taking every other request on the pod with it.
BCGW_SEARCH_BUDGET_SECONDS = 15

# How long a thread will wait on another thread's identical in-flight search
# before giving up its place in the queue. Sized to one upstream hop, so a
# waiter always outlasts a single warehouse call - the whole of a min-zoom
# lookup, and the common one or two hops of a nearest-feature search. Past that
# the answer is worth less than the thread: eight threads waiting out a search
# that runs its full budget is the pod serving nothing, sign-in included, which
# is the failure the thread pool exists to prevent. A thread that gives up says
# so rather than starting a second search - the stampede is what the lock is
# for, and the caller's retry will usually find the answer cached.
BCGW_SINGLE_FLIGHT_WAIT_SECONDS = BCGW_WFS_TIMEOUT_SECONDS

# Connections kept open to the warehouse. A fresh connection per hop costs a TLS
# handshake to openmaps - measured at ~120ms, on every window of every search -
# so the pool is sized to the worker's threads: any fewer and urllib3 discards
# the connections a busy moment opens, putting the handshake straight back.
# Read from the same variable gunicorn does, so the two cannot drift.
BCGW_CONNECTION_POOL_SIZE = int(os.getenv('GUNICORN_THREADS', '8'))

# Scale denominator at map zoom 0, from OGC's 0.28mm reference pixel, halving
# with every zoom level. This is what turns a layer's published scale limit into
# a minzoom, and it is half of OGC's own 559,082,264: that figure spans a 256
# pixel world, MapLibre's zoom 0 spans 512, so a MapLibre layer at zoom z draws
# at the scale the 256 pixel scale set calls z+1.
#
# No cosine-of-latitude term. GeoServer takes the scale straight off the
# EPSG:3857 bounding box in projected metres, so the denominator it weighs
# against a layer's MaxScaleDenominator does not vary with latitude.
#
# Both halves of that are load bearing, and both were checked against openmaps
# rather than reasoned about: ADM_NR_DISTRICTS_SPG publishes 1:35,000,000 and
# draws from map zoom 3, where this gives 1:34,942,641, and comes back blank at
# zoom 2. Get either half wrong and the figures still look plausible - they land
# on the right zoom for about three layers in five - so a layer like that one is
# the only thing that tells you.
WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO = 559082264.028 / 2

# Ceiling for a derived minzoom, because MapLibre rejects a layer minzoom above
# this. A layer whose limit converts past it is one the widget can never draw,
# which is the honest answer rather than an error.
WMS_MAX_LAYER_MIN_ZOOM = 24

# How long a layer's drawing scale is worth remembering. It comes out of a
# published style, which is revised on the scale of months, so this leans long -
# it is the difference between one GetCapabilities per layer and one per press.
LAYER_MIN_ZOOM_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

# Favourites are a bookmark list, not layers drawn on the map
MAX_FAVOURITE_LAYERS = 200

# Favourites may be filed into folders. A folder holds no layer state of its
# own, so it is capped separately from the layers inside it.
MAX_FAVOURITE_FOLDERS = 50

# What an unnamed folder is called. The client shows this pre-selected when a
# folder is created, and a name that is blank or only whitespace falls back to it.
DEFAULT_FOLDER_NAME = 'Untitled folder'

# The longest a folder name may be, matching the column it is stored in.
MAX_FOLDER_NAME_LENGTH = 100
