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
"""Tests for the BCGW WFS client.

Every warehouse call is stubbed - the session's `get` is what stands in for the
warehouse - so the suite does not depend on openmaps being up, or on what it
holds today.
"""

import json
import threading
import time
from unittest.mock import patch

import pytest
import requests

from map_api.exceptions import ServiceUnavailableError
from map_api.services.bcgw_service import IN_FLIGHT, BcgwService
from map_api.utils.cache import cache
from map_api.utils.constant import (
    BC_EXTENT, BCGW_CAPABILITIES_BYTE_LIMIT, NEAREST_GEOMETRY_BYTE_LIMIT, NEAREST_SEARCH_WINDOWS_DEGREES)


OBJECT_NAME = 'WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES'


@pytest.fixture(autouse=True)
def _empty_cache(app):
    """Start every test with nothing remembered.

    The cache is process wide, so without this one test's answer is another
    test's silent pass.
    """
    with app.app_context():
        cache.clear()


def _point_feature(lon, lat):
    return {'geometry': {'type': 'Point', 'coordinates': [lon, lat]}}


def _polygon_feature(points):
    return {'geometry': {'type': 'Polygon', 'coordinates': [[list(p) for p in points]]}}


def _hits(matched):
    """Return a resultType=hits FeatureCollection, XML whatever was asked for."""
    return f'<wfs:FeatureCollection numberMatched="{matched}" numberReturned="0"/>'


class _Response:
    """Just enough of a streamed requests.Response for the client."""

    def __init__(self, body):
        self.body = body.encode('utf-8')

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def raise_for_status(self):
        """Treat a stubbed response as a 200."""

    def iter_content(self, chunk_size):
        """Hand the body back the way urllib3 would, a chunk at a time."""
        for start in range(0, len(self.body), chunk_size):
            yield self.body[start:start + chunk_size]


def _answers(*payloads):
    """Stub requests.get, one canned payload per call, and record the calls.

    A dict is a GeoJSON body, an int a hits count, a string a raw body. One
    payload per expected call and no repeating of the last: a search that runs
    past the end is asking the warehouse something the test did not intend, and
    that is worth failing on rather than answering.
    """
    calls = []

    def body_for(payload):
        if isinstance(payload, dict):
            return json.dumps(payload)
        if isinstance(payload, int):
            return _hits(payload)
        return payload

    def get(url, params=None, timeout=None, stream=None):  # pylint: disable=unused-argument
        calls.append(params or {})
        assert len(calls) <= len(payloads), f'unexpected call {len(calls)} to the warehouse'
        return _Response(body_for(payloads[len(calls) - 1]))

    return get, calls


def _nothing_near(last):
    """Payloads for a search that finds nothing until the unfiltered fallback."""
    empty_windows = [0] * (len(NEAREST_SEARCH_WINDOWS_DEGREES) - 1)
    return [{'features': []}, *empty_windows, last]


def test_asks_for_one_feature_in_the_closest_window(app):
    """A window of geometry is hundreds of kilobytes this pod would carry."""
    get, calls = _answers({'features': [_point_feature(-123.0, 49.0)]})

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

    assert bounds == [-123.0, 49.0, -123.0, 49.0]
    assert calls[0]['count'] == 1
    assert 'resultType' not in calls[0]


def test_bounds_span_the_whole_feature(app):
    """A polygon zooms to all of itself, not to the vertex that was found."""
    ring = [(-121.0, 56.0), (-121.0, 55.0), (-119.0, 55.0), (-119.0, 56.0), (-121.0, 56.0)]
    get, _ = _answers({'features': [_polygon_feature(ring)]})

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -120.0, 55.5)

    assert bounds == [-121.0, 55.0, -119.0, 56.0]


def test_widening_asks_only_whether_a_window_holds_anything(app):
    """Past the closest window the answer is the window, so geometry is waste."""
    near_empty = {'features': []}
    get, calls = _answers(near_empty, 0, 3)

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

    # The window that reported features, not a feature inside it.
    third = NEAREST_SEARCH_WINDOWS_DEGREES[2]
    assert bounds == [-123.0 - third, 49.0 - third, -123.0 + third, 49.0 + third]
    assert len(calls) == 3
    # Only the first call carries geometry back; the widening hops are counts.
    assert [call.get('resultType') for call in calls] == [None, 'hits', 'hits']
    # Each retry asks about a wider box than the one before it.
    widths = [float(call['bbox'].split(',')[2]) - float(call['bbox'].split(',')[0])
              for call in calls]
    assert widths == sorted(widths) and widths[0] < widths[-1]


def test_falls_back_to_the_first_feature_when_none_are_near(app):
    """A layer with nothing nearby still has somewhere worth looking."""
    elsewhere = {'features': [_point_feature(-114.1, 49.1)]}
    # An empty closest window, then a zero count per widening, then the fallback.
    get, calls = _answers(*_nothing_near(elsewhere))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -160.0, 20.0)

    assert bounds == [-114.1, 49.1, -114.1, 49.1]
    # The fallback is the only call that does not constrain the search area.
    assert 'bbox' not in calls[-1]
    assert calls[-1]['count'] == 1


def test_an_answer_past_the_byte_cap_frames_the_window(app):
    """A polygon too heavy to parse still points the camera the right way."""
    get, _ = _answers('x' * (NEAREST_GEOMETRY_BYTE_LIMIT + 1))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

    nearest = NEAREST_SEARCH_WINDOWS_DEGREES[0]
    assert bounds == [-123.0 - nearest, 49.0 - nearest, -123.0 + nearest, 49.0 + nearest]


def test_an_oversized_fallback_lands_in_the_province(app):
    """The last resort cannot measure a giant feature, so it frames all of BC."""
    oversized = 'x' * (NEAREST_GEOMETRY_BYTE_LIMIT + 1)
    get, _ = _answers(*_nothing_near(oversized))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        bounds = BcgwService.nearest_feature_bounds(OBJECT_NAME, -160.0, 20.0)

    assert bounds == list(BC_EXTENT)


def test_returns_none_when_the_layer_has_no_features(app):
    """An empty layer is an answer, not an error."""
    get, _ = _answers(*_nothing_near({'features': []}))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0) is None


def test_treats_an_exception_report_as_no_features(app):
    """A WMS-only layer answers 200 with an OWS report rather than features."""
    report = {'exceptions': [{'exceptionCode': 'InvalidParameterValue'}]}
    get, _ = _answers(*_nothing_near(report))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0) is None


def test_asks_for_longitude_first(app):
    """The axis order is spelled out, or WFS 2.0 reads the box latitude first."""
    get, calls = _answers({'features': [_point_feature(-123.0, 49.0)]})

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

    west, south, east, north, crs = calls[0]['bbox'].split(',')
    assert crs == 'urn:ogc:def:crs:OGC:1.3:CRS84'
    assert float(west) < float(east) < 0      # longitudes, west of Greenwich
    assert 0 < float(south) < float(north)    # latitudes, north of the equator


def test_a_warehouse_outage_is_reported_as_unavailable(app):
    """A refused call becomes a 503, not a 500."""
    def get(url, params=None, timeout=None, stream=None):  # pylint: disable=unused-argument
        raise requests.ConnectionError('openmaps is down')

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        with pytest.raises(ServiceUnavailableError):
            BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)


def test_a_second_caller_nearby_is_served_from_memory(app):
    """The warehouse is asked once for a neighbourhood, not once per user."""
    get, calls = _answers({'features': [_point_feature(-123.0, 49.0)]})

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        first = BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.02, 49.02)
        second = BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.03, 49.01)

    assert first == second
    assert len(calls) == 1


def test_a_caller_far_away_is_not_served_the_wrong_answer(app):
    """Bucketing shares an answer between neighbours, not across the province."""
    found = {'features': [_point_feature(-123.0, 49.0)]}
    get, calls = _answers(found, found)

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)
        BcgwService.nearest_feature_bounds(OBJECT_NAME, -118.0, 54.0)

    assert len(calls) == 2


def test_a_layer_with_nothing_is_remembered_too(app):
    """Otherwise every press re-runs the full widening search for nothing."""
    get, calls = _answers(*_nothing_near({'features': []}))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0) is None
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0) is None

    # One widening search, not two.
    assert len(calls) == len(NEAREST_SEARCH_WINDOWS_DEGREES) + 1


def test_an_empty_layer_is_searched_once_however_far_the_user_pans(app):
    """Nothing anywhere is true of the layer, not of the neighbourhood.

    Without this the whole widening search runs again for every quarter degree
    the user moves, to reach an answer the pod already has.
    """
    get, calls = _answers(*_nothing_near({'features': []}))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0) is None
        assert BcgwService.nearest_feature_bounds(OBJECT_NAME, -118.0, 54.0) is None

    assert len(calls) == len(NEAREST_SEARCH_WINDOWS_DEGREES) + 1


def test_the_fallback_feature_is_not_fetched_once_per_neighbourhood(app):
    """Which row the table starts with does not depend on where the user is."""
    elsewhere = {'features': [_point_feature(-114.1, 49.1)]}
    # A full search from one place, then the widening hops alone from another:
    # the unfiltered fallback is answered from what the first search stored.
    empty_windows = [0] * (len(NEAREST_SEARCH_WINDOWS_DEGREES) - 1)
    get, calls = _answers(
        {'features': []}, *empty_windows, elsewhere,
        {'features': []}, *empty_windows,
    )

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        first = BcgwService.nearest_feature_bounds(OBJECT_NAME, -160.0, 20.0)
        second = BcgwService.nearest_feature_bounds(OBJECT_NAME, -150.0, 25.0)

    assert first == second == [-114.1, 49.1, -114.1, 49.1]
    assert sum('bbox' not in call for call in calls) == 1


def test_threads_asking_the_same_question_run_one_search(app):
    """Eight threads on one button must not be eight searches of the warehouse.

    The cache is only written once a search finishes, so without the lock every
    thread that arrives first misses and goes to the warehouse itself.
    """
    started = threading.Barrier(2, timeout=5)
    get, calls = _answers({'features': [_point_feature(-123.0, 49.0)]})

    def slow_get(*args, **kwargs):
        # Hold the warehouse open long enough that the other thread is certainly
        # inside nearest_feature_bounds rather than merely about to be.
        time.sleep(0.2)
        return get(*args, **kwargs)

    results = []

    def press():
        with app.app_context():
            started.wait()
            results.append(BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0))

    with patch('map_api.services.bcgw_service.SESSION.get', slow_get):
        threads = [threading.Thread(target=press) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)

    assert results == [[-123.0, 49.0, -123.0, 49.0]] * 2
    assert len(calls) == 1


def test_a_thread_that_gives_up_waiting_says_so_rather_than_searching(app):
    """The wait is bounded, and giving up must not become a second search.

    Eight threads parked behind one slow warehouse call is the pod serving
    nothing, sign-in included - the failure the thread count exists to prevent.
    A thread that runs out of patience releases its slot and asks the caller to
    try again, by which time the answer is usually cached.
    """
    inside = threading.Event()
    get, calls = _answers({'features': [_point_feature(-123.0, 49.0)]})

    def slow_get(*args, **kwargs):
        inside.set()
        time.sleep(0.5)
        return get(*args, **kwargs)

    searched = []

    def search():
        with app.app_context():
            searched.append(BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0))

    with patch('map_api.services.bcgw_service.SESSION.get', slow_get), \
            patch('map_api.services.bcgw_service.BCGW_SINGLE_FLIGHT_WAIT_SECONDS', 0.05):
        searcher = threading.Thread(target=search)
        searcher.start()
        assert inside.wait(timeout=5), 'the first thread never reached the warehouse'

        with app.app_context(), pytest.raises(ServiceUnavailableError):
            BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

        searcher.join(timeout=10)

    assert len(calls) == 1
    assert searched == [[-123.0, 49.0, -123.0, 49.0]]


def test_a_finished_search_leaves_no_lock_behind(app):
    """Otherwise the lock map grows with the day's traffic rather than its load."""
    get, _ = _answers({'features': [_point_feature(-123.0, 49.0)]})

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        BcgwService.nearest_feature_bounds(OBJECT_NAME, -123.0, 49.0)

    assert not IN_FLIGHT


def _capabilities(*denominators):
    """Return a WMS 1.3.0 capabilities document carrying these scale limits."""
    rules = ''.join(
        f'<MaxScaleDenominator>{value}</MaxScaleDenominator>' for value in denominators
    )
    return f'<WMS_Capabilities><Layer><Name>pub:x</Name>{rules}</Layer></WMS_Capabilities>'


def test_min_zoom_comes_from_the_published_scale(app):
    """1:250,000 is zoom 11 in BC - the figure the live service agrees with."""
    get, calls = _answers(_capabilities(250000.0))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 11

    assert calls[0]['request'] == 'GetCapabilities'
    # 1.1.1 carries the same limit as a ScaleHint in metres per pixel, which
    # would only need converting back again.
    assert calls[0]['version'] == '1.3.0'


def test_a_layer_with_no_declared_limit_draws_at_every_zoom(app):
    """None, not zero: the caller has to tell "no floor" from "floor of zero"."""
    get, _ = _answers('<WMS_Capabilities><Layer><Name>pub:x</Name></Layer></WMS_Capabilities>')

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) is None


def test_the_loosest_rule_sets_the_floor(app):
    """A style with a limit per rule starts drawing when the first one does."""
    get, _ = _answers(_capabilities(50000.0, 2000000.0, 250000.0))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        # 1:2,000,000 is the loosest, so zoom 8 rather than the 13 of 1:50,000.
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 8


def test_a_scale_no_zoom_can_reach_is_clamped(app):
    """A floor past zoom 24 is one MapLibre refuses, and never drawn is honest."""
    get, _ = _answers(_capabilities(0.5))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 24


def test_a_declared_scale_is_asked_for_once_per_layer(app):
    """It comes out of a published style, so it does not change between presses."""
    get, calls = _answers(_capabilities(250000.0))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 11
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 11

    assert len(calls) == 1


def test_no_limit_is_remembered_too(app):
    """Otherwise the layers that draw everywhere are the ones re-asked about."""
    get, calls = _answers('<WMS_Capabilities><Layer><Name>pub:x</Name></Layer></WMS_Capabilities>')

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) is None
        assert BcgwService.layer_min_zoom(OBJECT_NAME) is None

    assert len(calls) == 1


def test_a_scale_in_scientific_notation_is_read(app):
    """The warehouse writes some of these as 1.2E7, and most of them that way.

    A limit missed here does not fail - it reads as "no limit", which draws the
    layer at a zoom the server will only ever answer with a blank tile. That is
    the exact fault this endpoint exists to remove, so it is worth pinning.
    """
    get, _ = _answers(_capabilities('1.2E7'))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        # 1:12,000,000 at BC's latitudes, which the live service draws from z5.
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 5


def test_threads_asking_for_one_layers_scale_read_it_once(app):
    """The widget asks for every applied layer at once, so a cold cache is a burst.

    Without the lock each thread misses, and one panel opening becomes one
    GetCapabilities per layer per thread rather than per layer.
    """
    started = threading.Barrier(2, timeout=5)
    get, calls = _answers(_capabilities(250000.0))

    def slow_get(*args, **kwargs):
        time.sleep(0.2)
        return get(*args, **kwargs)

    results = []

    def ask():
        with app.app_context():
            started.wait()
            results.append(BcgwService.layer_min_zoom(OBJECT_NAME))

    with patch('map_api.services.bcgw_service.SESSION.get', slow_get):
        threads = [threading.Thread(target=ask) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)

    assert results == [11, 11]
    assert len(calls) == 1
    assert not IN_FLIGHT


def test_a_truncated_capabilities_document_is_not_read_as_no_limit(app):
    """The geometry cap must not reach the document that carries the floor.

    "No limit" is the reading that draws a layer at zooms openmaps only answers
    with a blank tile, which is the exact fault this endpoint exists to remove.
    A document too long to read is a 503, and nothing is remembered.
    """
    oversized = '<WMS_Capabilities>' + 'x' * (BCGW_CAPABILITIES_BYTE_LIMIT + 1)
    get, calls = _answers(oversized, _capabilities(250000.0))

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        with pytest.raises(ServiceUnavailableError):
            BcgwService.layer_min_zoom(OBJECT_NAME)

        # Nothing was stored, so the next caller reads the document rather than
        # being handed a floor that was never in it.
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 11

    assert len(calls) == 2


def test_a_capabilities_document_heavier_than_a_feature_is_still_read(app):
    """The two caps are different sizes on purpose, and this is the gap between.

    A document past what a feature is allowed to weigh is not by itself a
    document worth abandoning - there is no window to fall back on here, only
    the floor the document carries.
    """
    padding = 'x' * (NEAREST_GEOMETRY_BYTE_LIMIT + 1)
    body = (
        f'<WMS_Capabilities><Layer><Name>pub:x</Name><Abstract>{padding}</Abstract>'
        '<MaxScaleDenominator>250000.0</MaxScaleDenominator></Layer></WMS_Capabilities>'
    )
    get, _ = _answers(body)

    with app.app_context(), patch('map_api.services.bcgw_service.SESSION.get', get):
        assert BcgwService.layer_min_zoom(OBJECT_NAME) == 11
