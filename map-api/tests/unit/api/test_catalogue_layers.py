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


METADATA_ENDPOINT = f'/api/catalogue/layers/{OBJECT_NAME}/metadata'
METADATA_SERVICE = 'map_api.resources.catalogue_layer.BcgwService.metadata'
AROUND_A_CLICK = {'west': -123.101, 'south': 49.299, 'east': -123.099, 'north': 49.301}


def test_metadata_requires_a_token(app, client, session):
    """The warehouse proxy is not open to anonymous callers."""
    response = client.get(METADATA_ENDPOINT, query_string=AROUND_A_CLICK)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_metadata_returns_the_feature_under_the_click(app, client, jwt, session):
    """Attributes stay in the warehouse's order, as a list."""
    feature = {
        'id': 'WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES.1',
        'properties': [
            {'name': 'ZETA', 'value': 'first'},
            {'name': 'ALPHA', 'value': None},
        ],
        'geometry': {'type': 'Point', 'coordinates': [-123.1, 49.3]},
        'bounds': [-123.1, 49.3, -123.1, 49.3],
    }

    with patch(METADATA_SERVICE, return_value=feature) as service:
        response = client.get(
            METADATA_ENDPOINT, query_string=AROUND_A_CLICK, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'feature': feature}
    service.assert_called_once_with(OBJECT_NAME, (-123.101, 49.299, -123.099, 49.301))


def test_metadata_nothing_there_is_a_200_with_null(app, client, jwt, session):
    """Empty at the point is an answer; the client tells it apart from a failure."""
    with patch(METADATA_SERVICE, return_value=None):
        response = client.get(
            METADATA_ENDPOINT, query_string=AROUND_A_CLICK, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'feature': None}


@pytest.mark.parametrize(
    'query',
    [
        {},
        {**AROUND_A_CLICK, 'north': 'up'},
        {**AROUND_A_CLICK, 'west': -123.0, 'east': -123.1},   # back to front
        {**AROUND_A_CLICK, 'south': 49.4, 'north': 49.3},     # upside down
        {'west': -130.0, 'south': 49.0, 'east': -120.0, 'north': 49.1},  # not a click
        {**AROUND_A_CLICK, 'west': -200},
    ],
)
def test_metadata_rejects_a_bad_box(app, client, jwt, session, query):
    """Only a small box, the right way round, reaches the warehouse."""
    with patch(METADATA_SERVICE) as service:
        response = client.get(
            METADATA_ENDPOINT, query_string=query, headers=factory_auth_header(jwt)
        )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


def test_metadata_polices_the_object_name_too(app, client, jwt, session):
    """The name is interpolated into an outbound URL here as well."""
    with patch(METADATA_SERVICE) as service:
        response = client.get(
            '/api/catalogue/layers/WHSE_ADMIN,WHSE_OTHER/metadata',
            query_string=AROUND_A_CLICK,
            headers=factory_auth_header(jwt),
        )

    assert response.status_code in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)
    service.assert_not_called()
