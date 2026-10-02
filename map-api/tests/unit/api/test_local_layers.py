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
"""Tests for the locally hosted layer endpoints.

The service is stubbed throughout: the tile SQL needs a loaded extract, and the
extract is 36MB of data this repository should not hold. What is worth asserting
here is the endpoint's contract - who may call it, what an unknown layer gets,
and what an empty tile looks like to MapLibre.
"""
from http import HTTPStatus
from unittest.mock import patch

import pytest

from tests.utilities.factory_utils import factory_auth_header


OBJECT_NAME = 'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP'
TILE_ENDPOINT = f'/api/local/layers/{OBJECT_NAME}/tiles/9/74/165'
STYLE_ENDPOINT = f'/api/local/layers/{OBJECT_NAME}/style'

TILE_SERVICE = 'map_api.resources.local_layer.LocalLayerService.tile'
STYLE_SERVICE = 'map_api.resources.local_layer.LocalLayerService.style'

# Enough to stand in for a tile; the endpoint does not read it.
A_TILE = b'\x1a\x2f\x78\x02'

A_STYLE = {
    'source': {'min_zoom': 6, 'max_zoom': 12},
    'layers': [{
        'id': 'line',
        'type': 'line',
        'source_layer': 'pip_consultation_areas',
        'min_zoom': None,
        'filter': None,
        'layout': {'line-cap': 'round'},
        'paint': {
            'line-color': ['match', ['get', 'cnsltn_area_name'], 'A', '#005CE6', '#000000'],
        },
    }],
    'manifest': {'classCount': 299, 'matched': 298},
}


def test_a_tile_requires_a_token(app, client, session):
    """The one that matters: a silently public tile endpoint is not noticed.

    Everything under /api is gated by the before_request hook, and this asserts
    the tile path did not somehow escape it - MapLibre fetches tiles itself, so
    it is the one caller that does not go through the client's interceptor.
    """
    response = client.get(TILE_ENDPOINT)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_a_style_requires_a_token(app, client, session):
    """The style is not public either."""
    response = client.get(STYLE_ENDPOINT)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_returns_the_tile_the_service_built(app, client, jwt, session):
    """A tile comes back as vector tile bytes, not JSON."""
    with patch(TILE_SERVICE, return_value=A_TILE) as service:
        response = client.get(TILE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.data == A_TILE
    assert response.mimetype == 'application/vnd.mapbox-vector-tile'
    service.assert_called_once()


def test_an_empty_tile_is_no_content(app, client, jwt, session):
    """An empty tile is 204, because MapLibre reads 404 as an error.

    Most of the tile grid is not British Columbia, so this is the common case
    rather than an edge one.
    """
    with patch(TILE_SERVICE, return_value=b''):
        response = client.get(TILE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT


def test_a_tile_is_cacheable(app, client, jwt, session):
    """The application's default is no-store, which would refetch on every pan."""
    with patch(TILE_SERVICE, return_value=A_TILE):
        response = client.get(TILE_ENDPOINT, headers=factory_auth_header(jwt))

    assert 'no-store' not in response.headers['Cache-Control']
    assert 'private' in response.headers['Cache-Control']


def test_an_unknown_layer_is_not_found(app, client, jwt, session):
    """Proves the registry lookup, rather than a table name reaching SQL."""
    endpoint = '/api/local/layers/WHSE_FAKE.NOT_HOSTED_HERE/tiles/9/74/165'

    with patch(TILE_SERVICE) as service:
        response = client.get(endpoint, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND
    service.assert_not_called()


def test_a_malformed_layer_name_is_rejected(app, client, jwt, session):
    """The name is checked for shape before it is looked up."""
    endpoint = '/api/local/layers/not a valid name/tiles/9/74/165'

    response = client.get(endpoint, headers=factory_auth_header(jwt))

    assert response.status_code in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)


@pytest.mark.parametrize('z,x,y', [
    (0, 1, 0),      # only one tile exists at zoom 0
    (1, 2, 0),      # x past the edge of the pyramid
    (1, 0, 2),      # y past the edge
    (25, 0, 0),     # deeper than MapLibre addresses
])
def test_an_address_outside_the_pyramid_is_rejected(app, client, jwt, session, z, x, y):
    """An impossible address costs a query that can only return nothing."""
    endpoint = f'/api/local/layers/{OBJECT_NAME}/tiles/{z}/{x}/{y}'

    with patch(TILE_SERVICE) as service:
        response = client.get(endpoint, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


def test_returns_the_style_for_a_hosted_layer(app, client, jwt, session):
    """The client cannot draw a vector layer without this."""
    with patch(STYLE_SERVICE, return_value=A_STYLE):
        response = client.get(STYLE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json['source'] == {'minZoom': 6, 'maxZoom': 12}
    assert len(response.json['layers']) == 1

    drawn = response.json['layers'][0]
    assert drawn['type'] == 'line'
    assert drawn['sourceLayer'] == 'pip_consultation_areas'
    assert drawn['paint']['line-color'][0] == 'match'


def test_the_style_is_an_ordered_list_of_layers(app, client, jwt, session):
    """Order is draw order, and it has to survive the schema.

    A translucent polygon is a fill under a line; getting them back the other way
    round would hide the outline under the fill of the feature next to it.
    """
    two_layers = {
        'source': {'min_zoom': None, 'max_zoom': 12},
        'layers': [
            {'id': 'fill', 'type': 'fill', 'source_layer': 'eao_components',
             'min_zoom': None, 'filter': None, 'layout': {},
             'paint': {'fill-color': '#0072B2', 'fill-opacity': 0.3}},
            {'id': 'line', 'type': 'line', 'source_layer': 'eao_components',
             'min_zoom': None, 'filter': None, 'layout': {},
             'paint': {'line-color': '#0072B2', 'line-width': 1.6}},
        ],
        'manifest': {},
    }
    with patch(STYLE_SERVICE, return_value=two_layers):
        response = client.get(STYLE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert [one['id'] for one in response.json['layers']] == ['fill', 'line']
    assert response.json['layers'][0]['paint']['fill-opacity'] == 0.3


FEATURE_GUID = '44AD0BF7899D42CDBFC9597FA963A1CE'
FEATURE_ENDPOINT = f'/api/local/layers/{OBJECT_NAME}/features/{FEATURE_GUID}'
FEATURE_SERVICE = 'map_api.resources.local_layer.LocalLayerService.feature'

A_FEATURE = {
    'cnsltn_area_guid': FEATURE_GUID,
    'cnsltn_area_name': 'Taku River Tlingit First Nation',
    'contact_count': 1,
    'contacts': [{
        'contactName': 'Taku River Tlingit First Nation',
        'phoneNumber': '2506517900',
        'emailAddress': 'trtfn@gov.trtfn.com',
        'privateComment': None,
    }],
}


def test_a_feature_requires_a_token(app, client, session):
    """Contact details are behind the same gate as everything else.

    This is the response that carries them, so it is the one where the gate
    matters most.
    """
    response = client.get(FEATURE_ENDPOINT)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_returns_the_full_record_including_contacts(app, client, jwt, session):
    """The tile carries a key; this is what the key is for."""
    with patch(FEATURE_SERVICE, return_value=A_FEATURE):
        response = client.get(FEATURE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json['consultationAreaId'] == FEATURE_GUID
    assert response.json['contacts'][0]['phoneNumber'] == '2506517900'


def test_an_unknown_feature_is_not_found(app, client, jwt, session):
    """A key that matches nothing is a 404, not an empty record."""
    with patch(FEATURE_SERVICE, return_value=None):
        response = client.get(FEATURE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


@pytest.mark.parametrize('key', [
    'not-a-guid',
    '44AD0BF7899D42CDBFC9597FA963A1',      # too short
    "44AD0BF7899D42CDBFC9597FA963A1C'",    # quote, which a key never holds
])
def test_a_malformed_feature_key_is_rejected(app, client, jwt, session, key):
    """The tiles hand out 32 hex characters; anything else is a caller guessing."""
    endpoint = f'/api/local/layers/{OBJECT_NAME}/features/{key}'

    with patch(FEATURE_SERVICE) as service:
        response = client.get(endpoint, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    service.assert_not_called()


def test_a_layer_with_no_style_loaded_is_not_found(app, client, jwt, session):
    """A half-finished ingest is a 404, not an empty style.

    An empty style would paint every feature identically, which looks like a
    design decision rather than a layer that was never given its symbology.
    """
    with patch(STYLE_SERVICE, return_value=None):
        response = client.get(STYLE_ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND
