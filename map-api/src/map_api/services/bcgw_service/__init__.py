# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""BC Geographic Warehouse client. WFS feature access and WMS tile requests.

Why this is server side at all: openmaps answers WFS happily but never sends
`access-control-allow-origin`, so a browser is not allowed to read the response.
The map draws WMS tiles directly because image loading is not subject to that,
but anything the client needs to *read* has to come back through here.

Which means this pod is in the path of every press of "Zoom in to view", on a
quarter of a core, so the rule throughout is to carry as few of the warehouse's
bytes as the question allows.
"""

import json
import math
import re
import threading
import time
from contextlib import contextmanager
from http.cookiejar import DefaultCookiePolicy
from typing import Optional

import requests
from flask import current_app
from requests.adapters import HTTPAdapter

from map_api.exceptions import ServiceUnavailableError
from map_api.utils.cache import cache
from map_api.utils.constant import (
    BC_EXTENT, BCGW_CONNECTION_POOL_SIZE, BCGW_OWS_URL, BCGW_READ_CHUNK_BYTES, BCGW_SEARCH_BUDGET_SECONDS,
    BCGW_WFS_TIMEOUT_SECONDS, LAYER_MIN_ZOOM_CACHE_TTL_SECONDS, NEAREST_CACHE_PRECISION_DEGREES,
    NEAREST_CACHE_TTL_SECONDS, NEAREST_GEOMETRY_BYTE_LIMIT, NEAREST_SEARCH_WINDOWS_DEGREES, WMS_MAX_LAYER_MIN_ZOOM,
    WMS_SCALE_DENOMINATOR_AT_ZOOM_ZERO, WMS_SCALE_REFERENCE_LATITUDE)


# A [west, south, east, north] box, which is what the client fits the map to.
Bounds = list[float]

# `numberMatched` off a resultType=hits FeatureCollection. That body is a single
# empty element, so it is read rather than parsed: an XML parser here would be
# entity-expansion surface bought for one integer.
MATCHED_COUNT = re.compile(r'numberMatched="(\d+)"')

# A layer's coarsest drawing scale, off its WMS 1.3.0 capabilities. Read rather
# than parsed for the same reason as above, and because the value wanted is four
# digits in a document whose every other element is irrelevant here.
MAX_SCALE_DENOMINATOR = re.compile(
    r'<MaxScaleDenominator>\s*([\d.eE+-]+)\s*</MaxScaleDenominator>'
)

# How "this layer declares no scale limit" is remembered: a cached None is
# indistinguishable from a cache miss, and 0 is a legitimate minzoom.
NO_SCALE_LIMIT = -1


def _pooled_session() -> requests.Session:
    """One session for the process, holding connections open to openmaps.

    Nothing about it is mutated after this runs, and cookies are refused rather
    than collected, so it is a connection pool and no other shared state - which
    is what makes it safe for the worker's threads to share.
    """
    session = requests.Session()
    session.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
    session.mount(
        'https://',
        HTTPAdapter(
            pool_connections=1, pool_maxsize=BCGW_CONNECTION_POOL_SIZE
        ),
    )
    return session


SESSION = _pooled_session()

# Searches in flight, so that eight threads pressing the same button run one
# search between them rather than eight: the others wait, then find the answer
# already cached. Held only while a search runs and dropped the moment its
# answer is stored, so this never grows past the threads that are searching.
# In-process, like the cache it guards - a second worker would need Redis.
IN_FLIGHT: dict = {}
IN_FLIGHT_GUARD = threading.Lock()


@contextmanager
def _single_flight(key: str):
    """Hold the one lock for `key` while this thread searches."""
    with IN_FLIGHT_GUARD:
        lock = IN_FLIGHT.get(key)
        if lock is None:
            lock = IN_FLIGHT[key] = threading.Lock()

    with lock:
        try:
            yield
        finally:
            # A thread already waiting on this lock keeps its own reference and
            # will find the cached answer; one arriving after the drop takes a
            # fresh lock and finds the same. Dropping it is what keeps the map
            # the size of the work in flight rather than of the day's traffic.
            with IN_FLIGHT_GUARD:
                IN_FLIGHT.pop(key, None)


class BcgwService:
    """Reads features out of the BC Geographic Warehouse over WFS."""

    @classmethod
    def nearest_feature_bounds(
        cls, object_name: str, lon: float, lat: float
    ) -> Optional[Bounds]:
        """Return bounds worth pointing the camera at near `(lon, lat)`, or None.

        Searches outwards in widening windows and answers from the first window
        that holds anything, so a layer scattered across the province sends the
        user to the part of it they were already looking at. A layer whose
        features are all elsewhere falls back to its first feature, which is
        still somewhere to look.

        None means the layer published no features at all - it is a legitimate
        answer, not a failure.
        """
        key = cls._cache_key(object_name, lon, lat)
        remembered = cache.get(key)
        if remembered is not None:
            # An empty box is how "this layer has nothing" is remembered: a bare
            # None is indistinguishable from a cache miss.
            return remembered or None

        with _single_flight(key):
            # Another thread may have answered this exact question while this
            # one waited for the lock, which is the point of holding it.
            remembered = cache.get(key)
            if remembered is not None:
                return remembered or None

            bounds = cls._search(object_name, lon, lat)
            cache.set(key, bounds or [], timeout=NEAREST_CACHE_TTL_SECONDS)
            return bounds

    @classmethod
    def layer_min_zoom(cls, object_name: str) -> Optional[int]:
        """Lowest map zoom at which openmaps will actually draw this layer.

        Every warehouse layer publishes the coarsest scale its style draws at,
        and past that scale a GetMap comes back as a blank tile rather than an
        error - so a layer drawn outside its range reads to the user as a toggle
        that does nothing. The limits are not decorative: across the catalogue
        they run from 1:50,000 (zoom 13) to no limit at all, which is why one
        shared floor is wrong in both directions at once.

        None means the layer declares no limit and draws at every zoom.
        """
        key = cls._min_zoom_key(object_name)
        remembered = cache.get(key)
        if remembered is not None:
            return None if remembered == NO_SCALE_LIMIT else remembered

        denominator = cls._max_scale_denominator(object_name)
        zoom = None if denominator is None else cls._zoom_for_scale(denominator)

        cache.set(
            key,
            NO_SCALE_LIMIT if zoom is None else zoom,
            timeout=LAYER_MIN_ZOOM_CACHE_TTL_SECONDS,
        )
        return zoom

    @staticmethod
    def _min_zoom_key(object_name: str) -> str:
        """Cache key for a layer's drawing scale, which no position affects."""
        return f'bcgw:minzoom:{object_name}'

    @classmethod
    def _max_scale_denominator(cls, object_name: str) -> Optional[float]:
        """Return the coarsest scale this layer draws at, or None if it declares none.

        Asks WMS 1.3.0 even though the tiles are fetched over 1.1.1: 1.1.1
        spells the same limit as a `ScaleHint` in diagonal metres per pixel,
        which would need converting twice to arrive back here.
        """
        body = cls._read(object_name, {
            'service': 'WMS',
            'version': '1.3.0',
            'request': 'GetCapabilities',
        })
        found = MAX_SCALE_DENOMINATOR.findall(body or '')
        if not found:
            return None

        # A style can carry a limit per rule. The layer starts drawing as soon
        # as the loosest of them does, so that is the one that sets the floor.
        return max(float(value) for value in found)

    @staticmethod
    def _zoom_for_scale(denominator: float) -> int:
        """Lowest web-mercator zoom whose scale is finer than `denominator`."""
        narrowing = math.cos(math.radians(WMS_SCALE_REFERENCE_LATITUDE))
        at_zoom_zero = WMS_SCALE_DENOMINATOR_AT_ZOOM_ZERO * narrowing
        zoom = math.ceil(math.log2(at_zoom_zero / denominator))
        return max(0, min(zoom, WMS_MAX_LAYER_MIN_ZOOM))

    @classmethod
    def _search(cls, object_name: str, lon: float, lat: float) -> Optional[Bounds]:
        """Ask the warehouse, widest net last.

        Only the closest window is worth a feature's geometry. Past it the
        camera is travelling tens of kilometres anyway, so the window frames the
        answer as well as the feature inside it would - and asking a window only
        whether it holds anything keeps those hops under a kilobyte each, against
        the hundreds of kilobytes one warehouse polygon can weigh.
        """
        if cls._known_to_be_empty(object_name):
            # Nothing anywhere means nothing in any window either, so every hop
            # below would be spent reaching an answer already on record.
            return None

        deadline = time.monotonic() + BCGW_SEARCH_BUDGET_SECONDS
        near, *wider = NEAREST_SEARCH_WINDOWS_DEGREES

        bounds = cls._bounds_near(object_name, cls._window(lon, lat, near))
        if bounds is not None:
            return bounds

        for half_size in wider:
            if time.monotonic() > deadline:
                current_app.logger.info(
                    'Nearest-feature search for %s gave up at %s degrees: out '
                    'of time budget.', object_name, half_size
                )
                break
            window = cls._window(lon, lat, half_size)
            if cls._count_features(object_name, window):
                return list(window)

        return cls._bounds_anywhere(object_name)

    @classmethod
    def _bounds_near(cls, object_name: str, window: tuple) -> Optional[Bounds]:
        """Bounds for `window`, or None when the window holds nothing.

        The window itself is the answer whenever the feature in it cannot be
        measured cheaply - too many bytes to carry, or no coordinates at all.
        The user still lands where the layer is, framed a little wider.
        """
        features = cls._fetch_features(object_name, count=1, bbox=window)
        if features is None:
            return list(window)
        if not features:
            return None
        return cls._bounds_of(features[0]) or list(window)

    @classmethod
    def _bounds_anywhere(cls, object_name: str) -> Optional[Bounds]:
        """Where to look when the layer holds nothing within reach of the user.

        The warehouse publishes no per-layer extent to fall back on - every
        object's GetCapabilities carries the same province-wide box - so the
        first feature of the table is the only cheap evidence of where the layer
        actually is. A feature too heavy to measure is, by being that heavy,
        large enough that the province is about the right frame for it anyway.

        Remembered per layer rather than per neighbourhood: which row the table
        starts with does not depend on where the user is standing, so panning
        should not buy this same hop again.
        """
        key = cls._anywhere_key(object_name)
        remembered = cache.get(key)
        if remembered is not None:
            return remembered or None

        features = cls._fetch_features(object_name, count=1)
        if features is None:
            bounds = list(BC_EXTENT)
        else:
            bounds = cls._bounds_of(features[0]) if features else None

        cache.set(key, bounds or [], timeout=NEAREST_CACHE_TTL_SECONDS)
        return bounds

    @classmethod
    def _known_to_be_empty(cls, object_name: str) -> bool:
        """Whether this layer has already been found to publish no features at all.

        Only ever true once a search has run the whole way down and found
        nothing, so this short circuit costs a layer nothing it had not already
        paid for.
        """
        remembered = cache.get(cls._anywhere_key(object_name))
        return remembered is not None and not remembered

    @staticmethod
    def _anywhere_key(object_name: str) -> str:
        """Cache key for what is true of a layer wherever the user is standing."""
        return f'bcgw:anywhere:{object_name}'

    @staticmethod
    def _cache_key(object_name: str, lon: float, lat: float) -> str:
        """Bucket the caller's position so nearby callers share one answer."""
        step = NEAREST_CACHE_PRECISION_DEGREES
        return (
            f'bcgw:nearest:{object_name}'
            f':{round(lon / step) * step:.2f}:{round(lat / step) * step:.2f}'
        )

    @staticmethod
    def _window(lon: float, lat: float, half_size: float) -> tuple:
        """Return a square of `half_size` degrees about the point, clamped to the world.

        Degrees of longitude are narrower than degrees of latitude at BC's
        latitudes, so this window covers less ground east to west than it does
        north to south. It is a net, not a radius.
        """
        return (
            max(lon - half_size, -180.0),
            max(lat - half_size, -90.0),
            min(lon + half_size, 180.0),
            min(lat + half_size, 90.0),
        )

    @staticmethod
    def _feature_params(object_name: str, count: int, bbox: Optional[tuple]) -> dict:
        """WFS GetFeature parameters. `bbox` is (west, south, east, north)."""
        params = {
            'service': 'WFS',
            'version': '2.0.0',
            'request': 'GetFeature',
            'typeName': f'pub:{object_name}',
            'outputFormat': 'application/json',
            'srsName': 'EPSG:4326',
            'count': count,
        }
        if bbox is not None:
            # CRS84 spells the axis order out as longitude first. WFS 2.0 reads a
            # bare EPSG:4326 as latitude first, which silently returns the wrong
            # part of the world rather than an error.
            west, south, east, north = bbox
            params['bbox'] = (
                f'{west},{south},{east},{north},urn:ogc:def:crs:OGC:1.3:CRS84'
            )
        return params

    @classmethod
    def _fetch_features(
        cls, object_name: str, count: int, bbox: Optional[tuple] = None
    ) -> Optional[list]:
        """Features as GeoJSON, or None when the answer was too big to carry."""
        body = cls._read(object_name, cls._feature_params(object_name, count, bbox))
        if body is None:
            return None

        try:
            payload = json.loads(body)
        except ValueError as exc:
            current_app.logger.warning(
                'BCGW returned an unreadable body for %s: %s', object_name, exc
            )
            raise ServiceUnavailableError(
                'The BC Geographic Warehouse did not answer. Please try again.'
            ) from exc

        # A layer with no WFS endpoint answers 200 with an OWS exception report
        # rather than a feature collection, so the shape is what to trust.
        features = payload.get('features')
        return features if isinstance(features, list) else []

    @classmethod
    def _count_features(cls, object_name: str, bbox: tuple) -> int:
        """How many features fall in `bbox`, carrying none of their geometry.

        `resultType=hits` answers in well under a kilobyte whatever the layer
        holds, and the warehouse serves it from the spatial index. It is always
        XML, whatever output format is asked for.
        """
        params = cls._feature_params(object_name, count=1, bbox=bbox)
        params['resultType'] = 'hits'

        matched = MATCHED_COUNT.search(cls._read(object_name, params) or '')
        return int(matched.group(1)) if matched else 0

    @staticmethod
    def _read(object_name: str, params: dict) -> Optional[str]:
        """GET from the warehouse, or None once the answer passes the byte cap.
        """
        try:
            response = SESSION.get(
                BCGW_OWS_URL.format(object_name=object_name),
                params=params,
                timeout=BCGW_WFS_TIMEOUT_SECONDS,
                stream=True,
            )
            with response:
                response.raise_for_status()
                body = bytearray()
                for chunk in response.iter_content(BCGW_READ_CHUNK_BYTES):
                    body.extend(chunk)
                    if len(body) > NEAREST_GEOMETRY_BYTE_LIMIT:
                        current_app.logger.info(
                            'BCGW answer for %s passed %d bytes; framing the '
                            'search window instead.',
                            object_name, NEAREST_GEOMETRY_BYTE_LIMIT
                        )
                        return None
        except requests.RequestException as exc:
            current_app.logger.warning(
                'BCGW request failed for %s: %s', object_name, exc
            )
            raise ServiceUnavailableError(
                'The BC Geographic Warehouse did not answer. Please try again.'
            ) from exc

        return body.decode('utf-8', 'replace')

    @staticmethod
    def _bounds_of(feature: dict) -> Optional[Bounds]:
        """Return the feature's [west, south, east, north] box.

        Folded over the coordinates as they are walked rather than collected
        first: a warehouse polygon runs to tens of thousands of pairs, and three
        lists of them is memory this pod would rather not find.
        """
        box: Bounds = []

        def walk(node):
            if not isinstance(node, (list, tuple)) or not node:
                return
            if isinstance(node[0], (int, float)):
                lon, lat = node[0], node[1]
                if box:
                    box[0] = min(box[0], lon)
                    box[1] = min(box[1], lat)
                    box[2] = max(box[2], lon)
                    box[3] = max(box[3], lat)
                else:
                    box.extend((lon, lat, lon, lat))
                return
            for child in node:
                walk(child)

        walk((feature.get('geometry') or {}).get('coordinates'))
        return box or None
