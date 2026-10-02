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
"""Tests for the catalogue layer endpoints."""
from http import HTTPStatus
from unittest.mock import patch

import pytest

from map_api.utils.cache import cache
from map_api.utils.constant import METADATA_MAX_LAYERS
from tests.utilities.factory_utils import factory_auth_header


OBJECT_NAME = 'WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES'
ENDPOINT = f'/api/catalogue/layers/{OBJECT_NAME}/nearest-feature'
AT_VANCOUVER = {'lon': -123.1, 'lat': 49.3}

SERVICE = 'map_api.resources.catalogue_layer.BcgwService.nearest_feature_bounds'

MIN_ZOOM_ENDPOINT = f'/api/catalogue/layers/{OBJECT_NAME}/min-zoom'
MIN_ZOOM_SERVICE = 'map_api.resources.catalogue_layer.BcgwService.layer_min_zoom'


def test_nearest_feature_requires_a_token(app, client, session):
    """The warehouse proxy is not open to anonymous callers."""
    response = client.get(ENDPOINT, query_string=AT_VANCOUVER)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_returns_the_bounds_the_service_found(app, client, jwt, session):
    """The client gets a box it can fit the map to."""
    bounds = [-123.2, 49.2, -123.0, 49.4]

    with patch(SERVICE, return_value=bounds) as service:
        response = client.get(
            ENDPOINT, query_string=AT_VANCOUVER, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'bounds': bounds}
    service.assert_called_once_with(OBJECT_NAME, -123.1, 49.3)


def test_a_layer_with_no_features_is_a_404(app, client, jwt, session):
    """Nothing to zoom to is a missing thing, not a broken one."""
    with patch(SERVICE, return_value=None):
        response = client.get(
            ENDPOINT, query_string=AT_VANCOUVER, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.NOT_FOUND


@pytest.mark.parametrize(
    'query',
    [
        {},                                  # no point at all
        {'lon': -123.1},                     # half a point
        {'lon': -123.1, 'lat': 'somewhere'},  # not a number
        {'lon': -123.1, 'lat': 100},         # off the globe
        {'lon': -200, 'lat': 49.3},          # off the globe
    ],
)
def test_a_bad_point_is_rejected(app, client, jwt, session, query):
    """The caller says where it is looking, or gets a 400."""
    with patch(SERVICE) as service:
        response = client.get(
            ENDPOINT, query_string=query, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


@pytest.mark.parametrize(
    'object_name',
    [
        'WHSE_ADMIN_BOUNDARIES.CLAB:OTHER',   # a second namespace
        'WHSE_ADMIN,WHSE_OTHER',              # two layers in one
        'WHSE_ADMIN_BOUNDARIES.CLAB%2F..',    # climbing out of the path
        'WHSE ADMIN',                         # whitespace
    ],
)
def test_a_crafted_object_name_never_reaches_the_warehouse(
    app, client, jwt, session, object_name
):
    """The name is interpolated into an outbound URL, so it is policed first."""
    with patch(SERVICE) as service:
        response = client.get(
            f'/api/catalogue/layers/{object_name}/nearest-feature',
            query_string=AT_VANCOUVER,
            headers=factory_auth_header(jwt),
        )

    assert response.status_code in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)
    service.assert_not_called()


def test_min_zoom_requires_a_token(app, client, session):
    """The warehouse proxy is not open to anonymous callers."""
    response = client.get(MIN_ZOOM_ENDPOINT)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_returns_the_published_min_zoom(app, client, jwt, session):
    """The client gates the raster on this, so it is sent as a plain number."""
    with patch(MIN_ZOOM_SERVICE, return_value=11) as service:
        response = client.get(
            MIN_ZOOM_ENDPOINT, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'minZoom': 11}
    service.assert_called_once_with(OBJECT_NAME)


def test_a_layer_with_no_scale_limit_is_a_200_with_null(app, client, jwt, session):
    """Drawing at every zoom is an answer, not a missing one.

    A 404 here would read as "no such layer" and leave the client unable to tell
    a layer that needs no floor from one it could not ask about.
    """
    with patch(MIN_ZOOM_SERVICE, return_value=None):
        response = client.get(
            MIN_ZOOM_ENDPOINT, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'minZoom': None}


@pytest.mark.parametrize(
    'object_name',
    [
        'WHSE_ADMIN_BOUNDARIES.CLAB:OTHER',   # a second namespace
        'WHSE_ADMIN,WHSE_OTHER',              # two layers in one
        'WHSE ADMIN',                         # whitespace
    ],
)
def test_min_zoom_polices_the_object_name_too(
    app, client, jwt, session, object_name
):
    """The name is interpolated into an outbound URL here as well."""
    with patch(MIN_ZOOM_SERVICE) as service:
        response = client.get(
            f'/api/catalogue/layers/{object_name}/min-zoom',
            headers=factory_auth_header(jwt),
        )

    assert response.status_code in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)
    service.assert_not_called()


METADATA_ENDPOINT = '/api/catalogue/layers/metadata'
METADATA_SERVICE = 'map_api.resources.catalogue_layer.BcgwService.metadata_batch'
AROUND_A_CLICK = {'west': -123.101, 'south': 49.299, 'east': -123.099, 'north': 49.301}
ONE_LAYER = {**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME]}

FEATURE = {
    'id': 'WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES.1',
    'name': 'Musqueam 2',
    'properties': [
        {'name': 'ZETA', 'value': 'first'},
        {'name': 'ALPHA', 'value': None},
    ],
    'geometry': {'type': 'Point', 'coordinates': [-123.1, 49.3]},
    'bounds': [-123.1, 49.3, -123.1, 49.3],
}


@pytest.fixture(autouse=True)
def _forget_clicks(app):
    """Clear the click numbers between tests.

    The cache behind them is process wide, so without this one test's newest
    click supersedes the next test's older one.
    """
    with app.app_context():
        cache.clear()
    yield


def found(object_name, feature):
    """One layer's row as the service reports a feature it identified."""
    return {
        'object_name': object_name, 'status': 'found', 'feature': feature, 'error': None
    }


def test_metadata_requires_a_token(app, client, session):
    """The warehouse proxy is not open to anonymous callers."""
    response = client.post(METADATA_ENDPOINT, json=ONE_LAYER)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_metadata_returns_a_row_per_layer_in_the_order_asked(app, client, jwt, session):
    """One click, one request; attributes stay in the warehouse's order, as a list."""
    other = 'WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY'
    rows = [
        found(OBJECT_NAME, FEATURE),
        {'object_name': other, 'status': 'empty', 'feature': None, 'error': None},
    ]

    with patch(METADATA_SERVICE, return_value=rows) as service:
        response = client.post(
            METADATA_ENDPOINT,
            json={**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME, other]},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {
        'results': [
            {'objectName': OBJECT_NAME, 'status': 'found', 'feature': FEATURE, 'error': None},
            {'objectName': other, 'status': 'empty', 'feature': None, 'error': None},
        ]
    }
    assert service.call_args.args[0] == [OBJECT_NAME, other]
    assert service.call_args.args[1] == (-123.101, 49.299, -123.099, 49.301)


def test_metadata_one_layer_failing_does_not_fail_the_click(app, client, jwt, session):
    """A layer that could not be asked carries its own error beside the answers."""
    broken = 'WHSE_BASEMAPPING.NO_SUCH_TABLE'
    rows = [
        found(OBJECT_NAME, FEATURE),
        {
            'object_name': broken,
            'status': 'error',
            'feature': None,
            'error': 'The BC Geographic Warehouse did not answer. Please try again.',
        },
    ]

    with patch(METADATA_SERVICE, return_value=rows):
        response = client.post(
            METADATA_ENDPOINT,
            json={**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME, broken]},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.OK
    assert [row['status'] for row in response.json['results']] == ['found', 'error']


def test_metadata_nothing_there_is_a_200(app, client, jwt, session):
    """Empty at the point is an answer; the client tells it apart from a failure."""
    rows = [{'object_name': OBJECT_NAME, 'status': 'empty', 'feature': None, 'error': None}]

    with patch(METADATA_SERVICE, return_value=rows):
        response = client.post(
            METADATA_ENDPOINT, json=ONE_LAYER, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json['results'][0]['feature'] is None


@pytest.mark.parametrize(
    'body',
    [
        {},
        {'objectNames': [OBJECT_NAME]},                                  # no box
        {**AROUND_A_CLICK},                                              # no layers
        {**AROUND_A_CLICK, 'objectNames': []},                           # no layers
        {**ONE_LAYER, 'north': 'up'},
        {**ONE_LAYER, 'west': -123.0, 'east': -123.1},                   # back to front
        {**ONE_LAYER, 'south': 49.4, 'north': 49.3},                     # upside down
        {'west': -130.0, 'south': 49.0, 'east': -120.0, 'north': 49.1,
         'objectNames': [OBJECT_NAME]},                                  # not a click
        {**ONE_LAYER, 'west': -200},
    ],
)
def test_metadata_rejects_a_bad_click(app, client, jwt, session, body):
    """Only a small box, the right way round, over named layers reaches the warehouse."""
    with patch(METADATA_SERVICE) as service:
        response = client.post(
            METADATA_ENDPOINT, json=body, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


@pytest.mark.parametrize(
    'object_name',
    ['WHSE_ADMIN,WHSE_OTHER', '../../etc/passwd', 'pub:WHSE_ADMIN', 'WHSE ADMIN'],
)
def test_metadata_polices_every_object_name(app, client, jwt, session, object_name):
    """Each name is interpolated into an outbound URL, so each is checked."""
    with patch(METADATA_SERVICE) as service:
        response = client.post(
            METADATA_ENDPOINT,
            json={**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME, object_name]},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


def test_metadata_caps_how_many_layers_one_click_may_ask_about(app, client, jwt, session):
    """Past the cap the click is refused rather than fanned out."""
    with patch(METADATA_SERVICE) as service:
        response = client.post(
            METADATA_ENDPOINT,
            json={**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME] * (METADATA_MAX_LAYERS + 1)},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


@pytest.mark.parametrize('client_id', ['has spaces', 'has:colon', 'x' * 65, ''])
def test_metadata_polices_the_client_id(app, client, jwt, session, client_id):
    """It reaches a cache key, so it is checked like anything else that leaves here."""
    with patch(METADATA_SERVICE) as service:
        response = client.post(
            METADATA_ENDPOINT,
            json={**ONE_LAYER, 'clientId': client_id, 'clickId': 1},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


def test_metadata_a_newer_click_supersedes_an_older_one(app, client, jwt, session):
    """The click number is what a sync worker has instead of a dropped socket."""
    rows = [found(OBJECT_NAME, FEATURE)]

    with patch(METADATA_SERVICE, return_value=rows) as service:
        client.post(
            METADATA_ENDPOINT,
            json={**ONE_LAYER, 'clientId': 'map-a', 'clickId': 7},
            headers=factory_auth_header(jwt),
        )
        abandoned_of_click_7 = service.call_args.kwargs['abandoned']

        # Click 7 is still the newest, so its work is still worth doing.
        assert abandoned_of_click_7() is False

        client.post(
            METADATA_ENDPOINT,
            json={**ONE_LAYER, 'clientId': 'map-a', 'clickId': 8},
            headers=factory_auth_header(jwt),
        )

    assert abandoned_of_click_7() is True


def test_metadata_another_client_does_not_supersede_this_one(app, client, jwt, session):
    """Two maps clicking at once are two conversations, not one."""
    rows = [found(OBJECT_NAME, FEATURE)]

    with patch(METADATA_SERVICE, return_value=rows) as service:
        client.post(
            METADATA_ENDPOINT,
            json={**ONE_LAYER, 'clientId': 'map-a', 'clickId': 7},
            headers=factory_auth_header(jwt),
        )
        abandoned_of_map_a = service.call_args.kwargs['abandoned']

        client.post(
            METADATA_ENDPOINT,
            json={**ONE_LAYER, 'clientId': 'map-b', 'clickId': 99},
            headers=factory_auth_header(jwt),
        )

    assert abandoned_of_map_a() is False


def test_metadata_a_client_that_sends_no_click_number_is_never_abandoned(
    app, client, jwt, session
):
    """Saying which click this is opts in; a client that does not is left alone."""
    rows = [found(OBJECT_NAME, FEATURE)]

    with patch(METADATA_SERVICE, return_value=rows) as service:
        client.post(
            METADATA_ENDPOINT, json=ONE_LAYER, headers=factory_auth_header(jwt)
        )

    assert service.call_args.kwargs['abandoned']() is False


def test_metadata_a_layer_raising_does_not_500_the_click(app, client, jwt, session):
    """The whole way through, one layer going wrong is still a 200.

    The service is real here rather than stubbed: what is being checked is that
    nothing a single layer does escapes the pool and reaches the client as a
    failure of the request.
    """
    other = 'WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY'

    def answer(object_name, _bbox):
        if object_name == other:
            raise TypeError("'NoneType' object is not subscriptable")
        return FEATURE

    with patch(
        'map_api.services.bcgw_service.BcgwService.metadata', side_effect=answer
    ):
        response = client.post(
            METADATA_ENDPOINT,
            json={**AROUND_A_CLICK, 'objectNames': [OBJECT_NAME, other]},
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.OK
    results = response.json['results']
    assert [row['status'] for row in results] == ['found', 'error']
    assert results[0]['feature'] == FEATURE
    assert results[1]['error']
