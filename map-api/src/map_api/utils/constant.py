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

# Bytes of a warehouse answer this pod will carry before it stops reading. A
# single BCGW polygon can run past half a megabyte of coordinates - watershed
# groups do - and decompressing and parsing that holds the GIL on a quarter of a
# core, stalling every other request in the process. Past this the search window
# frames the camera instead, which costs the user a little zoom and nothing else.
# Set well above the few kilobytes a feature of a zoomable layer actually weighs,
# so this bounds the tail rather than shaping the common answer.
NEAREST_GEOMETRY_BYTE_LIMIT = 128 * 1024

# Read granularity for the capped read above: large enough not to loop per
# packet, small enough to notice the cap before much past it.
BCGW_READ_CHUNK_BYTES = 32 * 1024

# Wall clock a whole widening search may spend on the warehouse before it stops
# widening. The per-request timeout bounds one hop; this bounds the sequence, so
# a slow layer cannot hold a worker thread for a multiple of it.
#
# The budget is checked between hops, so the true ceiling is this plus the hop
# that crosses it plus the unfiltered fallback: 8 + 8 + 8 at the timeout above.
# That has to stay under gunicorn's 30 second default, which does not fail one
# request - it kills the worker, taking every other request on the pod with it.
BCGW_SEARCH_BUDGET_SECONDS = 15

# Connections kept open to the warehouse. A fresh connection per hop costs a TLS
# handshake to openmaps - measured at ~120ms, on every window of every search -
# so the pool is sized to the worker's threads: any fewer and urllib3 discards
# the connections a busy moment opens, putting the handshake straight back.
# Read from the same variable gunicorn does, so the two cannot drift.
BCGW_CONNECTION_POOL_SIZE = int(os.getenv('GUNICORN_THREADS', '8'))

# OGC's scale denominator for web-mercator zoom 0 at the equator, from a 0.28mm
# reference pixel. Halves with every zoom level, and narrows with the cosine of
# the latitude, which is what turns a layer's published scale limit into a zoom.
WMS_SCALE_DENOMINATOR_AT_ZOOM_ZERO = 559082264.028

# Latitude the conversion above is done at. A MapLibre layer takes one minzoom,
# but scale varies with latitude, so this is the south edge of the province -
# where the scale is coarsest, and so the zoom it yields is the one that holds
# for all of BC rather than only for the north. Matches BC_EXTENT's south.
WMS_SCALE_REFERENCE_LATITUDE = 48.2

# Ceiling for a derived minzoom, because MapLibre rejects a layer minzoom above
# this. A layer whose limit converts past it is one the widget can never draw,
# which is the honest answer rather than an error.
WMS_MAX_LAYER_MIN_ZOOM = 24

# How long a layer's drawing scale is worth remembering. It comes out of a
# published style, which is revised on the scale of months, so this leans long -
# it is the difference between one GetCapabilities per layer and one per press.
LAYER_MIN_ZOOM_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
