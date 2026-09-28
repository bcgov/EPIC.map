# Copyright © 2026 Province of British Columbia
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
"""Tests for the imported layer endpoints."""
import gzip
import io
import json
import uuid
from http import HTTPStatus

import pytest
from sqlalchemy import func

from map_api.models.db import db
from map_api.models.user_layer import UserLayer
from map_api.models.user_layer_feature import UserLayerFeature
from map_api.services import user_layer_service
from tests.utilities.factory_utils import SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, factory_auth_header, idir_claims


ENDPOINT = '/api/users/me/imported-layers'

VICTORIA = [-123.3701, 48.4196]
NANAIMO = [-123.9401, 49.1659]
LONDON = [-0.1276, 51.5072]


def point(coordinates, **properties):
    """Return a GeoJSON point feature."""
    return {
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': coordinates},
        'properties': properties,
    }


def gzipped_lines(features):
    """Return features as gzipped GeoJSONSeq, the way the widget sends them."""
    lines = '\n'.join(
        feature if isinstance(feature, str) else json.dumps(feature) for feature in features
    )
    return gzip.compress(lines.encode('utf-8'))


def form(features=None, body=None, **fields):
    """Return the multipart form an upload sends."""
    data = {
        'name': 'Roads',
        'description': 'Resource roads',
        'is_sensitive': 'false',
        'source_format': 'Shapefile',
        'source_filename': 'roads.zip',
        'source_crs': 'NAD83 BC Environment Albers',
        **fields,
    }
    if body is None:
        body = gzipped_lines(features if features is not None else [point(VICTORIA, NAME='Legislature')])
    if body is not False:
        data['features'] = (io.BytesIO(body), 'features.geojsonl.gz')
    return {k: v for k, v in data.items() if v is not None}


def put(client, headers, layer_id=None, **kwargs):
    """Upload a layer and return the response."""
    return client.put(
        f'{ENDPOINT}/{layer_id or uuid.uuid4()}',
        data=form(**kwargs),
        headers=headers,
        content_type='multipart/form-data',
    )


def second_user_auth_header(jwt):
    """Return an Authorization header for a different IDIR account."""
    return factory_auth_header(
        jwt,
        idir_claims(
            sub=SECOND_AUTH_GUID,
            preferred_username=SECOND_AUTH_GUID,
            idir_username=SECOND_IDIR_USERNAME,
        ),
    )


@pytest.mark.parametrize(
    'method, path',
    [
        ('get', ENDPOINT),
        ('put', f'{ENDPOINT}/{uuid.uuid4()}'),
        ('delete', f'{ENDPOINT}/{uuid.uuid4()}'),
        ('get', f'{ENDPOINT}/{uuid.uuid4()}/features'),
    ],
)
def test_imported_layer_endpoints_require_a_token(app, client, session, method, path):
    """Nothing here is reachable without a verified token."""
    response = getattr(client, method)(path)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_put_stores_the_layer_and_summarises_it(app, client, jwt, session):
    """The layer comes back with what the server counted, not what was claimed."""
    layer_id = uuid.uuid4()

    response = put(
        client, factory_auth_header(jwt), layer_id,
        features=[point(VICTORIA), point(NANAIMO)], is_sensitive='true',
    )

    assert response.status_code == HTTPStatus.CREATED
    body = response.json
    assert body['id'] == str(layer_id)
    assert body['name'] == 'Roads'
    assert body['description'] == 'Resource roads'
    assert body['is_sensitive'] is True
    assert body['source_format'] == 'Shapefile'
    assert body['source_crs'] == 'NAD83 BC Environment Albers'
    assert body['geometry_type'] == 'Point'
    assert body['feature_count'] == 2
    assert body['extent'] == pytest.approx([NANAIMO[0], VICTORIA[1], VICTORIA[0], NANAIMO[1]])


def test_a_retry_returns_the_layer_already_stored(app, client, jwt, session):
    """The same id twice is one layer, so Try Again cannot make a duplicate."""
    headers = factory_auth_header(jwt)
    layer_id = uuid.uuid4()
    put(client, headers, layer_id)

    response = put(client, headers, layer_id)

    assert response.status_code == HTTPStatus.OK
    assert response.json['id'] == str(layer_id)
    assert UserLayer.query.count() == 1
    assert UserLayerFeature.query.count() == 1


def test_a_name_differing_only_in_case_is_refused(app, client, jwt, session):
    """The widget's own message, so it can be shown as it is."""
    headers = factory_auth_header(jwt)
    put(client, headers, name='Roads')

    response = put(client, headers, name=' roads ')

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json['message'] == 'You already have a layer named "roads". Enter a different name.'


def test_another_users_layer_name_is_free(app, client, jwt, session):
    """Names are unique per user."""
    put(client, second_user_auth_header(jwt), name='Roads')

    response = put(client, factory_auth_header(jwt), name='Roads')

    assert response.status_code == HTTPStatus.CREATED


def test_another_users_layer_id_is_refused(app, client, jwt, session):
    """A retry finds only its own layer; someone else's id is not handed back."""
    layer_id = uuid.uuid4()
    put(client, second_user_auth_header(jwt), layer_id)

    response = put(client, factory_auth_header(jwt), layer_id)

    assert response.status_code == HTTPStatus.CONFLICT
    assert 'Roads' not in response.json['message']


@pytest.mark.parametrize('fields, field, message', [
    ({'is_sensitive': None}, 'is_sensitive', 'Select whether this layer contains sensitive information'),
    ({'name': '   '}, 'name', 'Enter a layer name.'),
    ({'name': None}, 'name', 'Enter a layer name.'),
    ({'name': 'x' * 101}, 'name', 'Enter a layer name of 100 characters or fewer.'),
    ({'description': 'x' * 1001}, 'description', 'Enter a description of 1000 characters or fewer.'),
    ({'source_format': 'CSV'}, 'source_format', None),
])
def test_form_fields_are_validated(app, client, jwt, session, fields, field, message):
    """The required choices are enforced here as well as in the widget."""
    response = put(client, factory_auth_header(jwt), **fields)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert field in response.json['errors']
    if message:
        assert response.json['errors'][field] == [message]


def test_the_features_file_is_required(app, client, jwt, session):
    """A form with no features is not a layer."""
    response = put(client, factory_auth_header(jwt), body=False)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_features_that_are_not_gzipped_are_refused(app, client, jwt, session):
    """The body must be what the widget sends."""
    response = put(client, factory_auth_header(jwt), body=json.dumps(point(VICTORIA)).encode())

    assert response.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.parametrize('line, message', [
    ('{not json', 'Feature 2 is not valid JSON.'),
    ('{"type": "Polygon", "coordinates": []}', 'Line 2 is not a GeoJSON feature.'),
    (json.dumps(point([200, 48])), 'Feature 2 has coordinates outside longitude and latitude.'),
    (json.dumps(point(['a', 'b'])), 'Feature 2 has coordinates that could not be read.'),
    (json.dumps(point([-123.0])), 'Feature 2 has coordinates that could not be read.'),
    ('{"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [NaN, 48]}}',
     'Feature 2 is not valid JSON.'),
    (json.dumps({'type': 'Feature', 'properties': {}, 'geometry': {
        'type': 'LineString', 'coordinates': [VICTORIA, [-123.1, 'x']]}}),
     'Feature 2 has coordinates that could not be read.'),
    (json.dumps({'type': 'Feature', 'properties': [], 'geometry': {'type': 'Point', 'coordinates': VICTORIA}}),
     'Feature 2 has properties that are not an object.'),
    (json.dumps({'type': 'Feature', 'geometry': {'type': 'Circle'}, 'properties': {}}),
     'Feature 2 has a geometry that could not be read.'),
])
def test_a_bad_line_is_refused_by_number(app, client, jwt, session, line, message):
    """The message says which feature, so the user can find it."""
    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA), line])

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json['message'] == message
    assert UserLayer.query.count() == 0


def test_a_layer_entirely_outside_bc_is_refused(app, client, jwt, session):
    """Nothing is stored for a refused layer."""
    response = put(client, factory_auth_header(jwt), features=[point(LONDON)])

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json['message'] == 'This layer lies entirely outside British Columbia.'
    assert UserLayer.query.count() == 0
    assert UserLayerFeature.query.count() == 0


def test_a_layer_partly_in_bc_is_accepted(app, client, jwt, session):
    """Only a layer with nothing in the province is refused."""
    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA), point(LONDON)])

    assert response.status_code == HTTPStatus.CREATED


def test_too_many_features_is_refused(app, client, jwt, session, monkeypatch):
    """The cap is on what would be stored."""
    monkeypatch.setattr(user_layer_service, 'MAX_USER_LAYER_FEATURES', 2)

    response = put(
        client, factory_auth_header(jwt), features=[point(VICTORIA), point(NANAIMO), point(VICTORIA)],
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert UserLayer.query.count() == 0


def test_an_oversized_feature_is_refused(app, client, jwt, session, monkeypatch):
    """One feature cannot take the pod's memory."""
    monkeypatch.setattr(user_layer_service, 'MAX_USER_LAYER_FEATURE_BYTES', 64)

    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA, NOTE='x' * 100)])

    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    assert response.json['message'].startswith('Feature 1 is larger than')


def test_an_upload_that_inflates_too_far_is_refused(app, client, jwt, session, monkeypatch):
    """The unpacked size is capped, not only the upload."""
    monkeypatch.setattr(user_layer_service, 'MAX_USER_LAYER_GEOJSON_BYTES', 200)

    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA)] * 5)

    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE


def test_features_without_geometry_are_dropped(app, client, jwt, session):
    """Attributes with nothing to draw are not counted."""
    response = put(
        client, factory_auth_header(jwt),
        features=[point(VICTORIA), {'type': 'Feature', 'geometry': None, 'properties': {'A': 1}}],
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['feature_count'] == 1


def test_a_file_with_nothing_to_draw_is_refused(app, client, jwt, session):
    """A layer of no features is not stored."""
    response = put(
        client, factory_auth_header(jwt),
        features=[{'type': 'Feature', 'geometry': None, 'properties': {}}],
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json['message'] == 'This file holds no features to import.'


def test_mixed_geometry_is_summarised_as_mixed(app, client, jwt, session):
    """One label for the whole layer, the way the widget's summary reads."""
    line = {'type': 'Feature', 'properties': {},
            'geometry': {'type': 'LineString', 'coordinates': [VICTORIA, NANAIMO]}}

    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA), line])

    assert response.json['geometry_type'] == 'Mixed'


def test_altitudes_are_dropped(app, client, jwt, session):
    """KML carries a third coordinate; the stored geometry is flat."""
    response = put(client, factory_auth_header(jwt), features=[point([*VICTORIA, 25.0])])

    assert response.status_code == HTTPStatus.CREATED
    assert db.session.scalar(func.ST_NDims(UserLayerFeature.query.one().geom)) == 2


def test_an_invalid_polygon_is_repaired(app, client, jwt, session):
    """A self-crossing ring is stored valid rather than refused."""
    west, south = VICTORIA
    bowtie = {
        'type': 'Feature', 'properties': {},
        'geometry': {'type': 'Polygon', 'coordinates': [[
            [west, south], [west + 0.1, south + 0.1], [west + 0.1, south], [west, south + 0.1], [west, south],
        ]]},
    }

    response = put(client, factory_auth_header(jwt), features=[bowtie])

    assert response.status_code == HTTPStatus.CREATED
    assert db.session.scalar(func.ST_IsValid(UserLayerFeature.query.one().geom)) is True


def test_nul_characters_are_dropped_from_attributes(app, client, jwt, session):
    """Postgres cannot hold a NUL in jsonb, and shapefile text fields pad with them."""
    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA, NAME='Road\u0000\u0000')])

    assert response.status_code == HTTPStatus.CREATED
    assert UserLayerFeature.query.one().properties == {'NAME': 'Road'}


def test_get_lists_only_this_users_layers(app, client, jwt, session):
    """Two users' layers do not see each other."""
    put(client, second_user_auth_header(jwt), name='Theirs')
    mine = put(client, factory_auth_header(jwt), name='Mine').json

    response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert [layer['id'] for layer in response.json] == [mine['id']]


def test_features_come_back_as_wgs84_geojson_in_file_order(app, client, jwt, session):
    """Stored in BC Albers, served in the coordinates the map draws in."""
    headers = factory_auth_header(jwt)
    layer = put(
        client, headers, features=[point(VICTORIA, NAME='Legislature'), point(NANAIMO, NAME='Harbour')],
    ).json

    response = client.get(f"{ENDPOINT}/{layer['id']}/features", headers=headers)

    assert response.status_code == HTTPStatus.OK
    assert response.mimetype == 'application/geo+json'
    body = json.loads(response.get_data(as_text=True))
    assert body['type'] == 'FeatureCollection'
    assert [feature['properties']['NAME'] for feature in body['features']] == ['Legislature', 'Harbour']
    assert body['features'][0]['geometry']['coordinates'] == pytest.approx(VICTORIA, abs=1e-6)


def test_features_are_gzipped_for_a_client_that_accepts_it(app, client, jwt, session):
    """The browser asks for gzip, and GeoJSON shrinks well."""
    headers = factory_auth_header(jwt)
    layer_id = put(client, headers, features=[point(VICTORIA, NAME='Legislature')]).json['id']

    response = client.get(f'{ENDPOINT}/{layer_id}/features', headers={**headers, 'Accept-Encoding': 'gzip'})

    assert response.status_code == HTTPStatus.OK
    assert response.headers['Content-Encoding'] == 'gzip'
    body = json.loads(gzip.decompress(response.get_data()))
    assert body['features'][0]['properties'] == {'NAME': 'Legislature'}


def test_another_users_features_are_not_found(app, client, jwt, session):
    """Ownership is part of the lookup."""
    theirs = put(client, second_user_auth_header(jwt)).json

    response = client.get(f"{ENDPOINT}/{theirs['id']}/features", headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_delete_removes_the_layer_and_its_features(app, client, jwt, session):
    """Gone, features and all."""
    headers = factory_auth_header(jwt)
    layer = put(client, headers).json

    response = client.delete(f"{ENDPOINT}/{layer['id']}", headers=headers)

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert UserLayer.query.count() == 0
    assert UserLayerFeature.query.count() == 0


def test_delete_is_idempotent_and_leaves_other_users_alone(app, client, jwt, session):
    """204 whether or not it was there, and someone else's layer survives."""
    theirs = put(client, second_user_auth_header(jwt)).json

    response = client.delete(f"{ENDPOINT}/{theirs['id']}", headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert UserLayer.query.count() == 1


def test_a_geometry_postgis_cannot_build_is_refused(app, client, jwt, session):
    """A point nested like a line passes the coordinate checks but is not a point."""
    nested = {'type': 'Feature', 'properties': {},
              'geometry': {'type': 'Point', 'coordinates': [VICTORIA]}}

    response = put(client, factory_auth_header(jwt), features=[nested])

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert UserLayer.query.count() == 0


def test_oversized_attributes_are_refused(app, client, jwt, session, monkeypatch):
    """Attributes are capped per feature."""
    monkeypatch.setattr(user_layer_service, 'MAX_USER_LAYER_PROPERTIES_BYTES', 16)

    response = put(client, factory_auth_header(jwt), features=[point(VICTORIA, NOTE='x' * 32)])

    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE


def test_a_line_that_is_not_utf8_is_refused(app, client, jwt, session):
    """The widget always sends UTF-8."""
    response = put(client, factory_auth_header(jwt), body=gzip.compress(b'\xff\xfe{}'))

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json['message'] == 'Feature 1 is not valid JSON.'


def test_features_stream_after_the_request_session_is_gone(app, client, jwt, session):
    """The stream runs after the view returns, when the request's models are detached.

    The fixture keeps one session alive for the whole test, which hides this; so
    the layer is detached by hand before the stream is read, the way it is by
    the time a real server gets to it.
    """
    layer_id = uuid.UUID(put(client, factory_auth_header(jwt), features=[point(VICTORIA)]).json['id'])
    db.session.expire_all()
    db.session.expunge_all()

    body = json.loads(''.join(user_layer_service.UserLayerService.feature_collection_chunks(layer_id)))

    assert len(body['features']) == 1


def test_features_stream_in_pieces_that_join_into_one_collection(app, client, jwt, session, monkeypatch):
    """Rows are gathered into pieces rather than written one by one."""
    monkeypatch.setattr(user_layer_service, 'USER_LAYER_STREAM_CHUNK_BYTES', 1)
    layer_id = uuid.UUID(put(client, factory_auth_header(jwt), features=[point(VICTORIA)] * 3).json['id'])

    chunks = list(user_layer_service.UserLayerService.feature_collection_chunks(layer_id))

    assert len(chunks) == 4
    assert len(json.loads(''.join(chunks))['features']) == 3
