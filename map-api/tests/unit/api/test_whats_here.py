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
"""Tests for What's here: real PostGIS rows, a stubbed warehouse."""

import math
import uuid
from http import HTTPStatus
from unittest.mock import patch

from sqlalchemy import text

from map_api.models.db import db
from map_api.services.bcgw_service import BcgwService
from map_api.services.local_layer_service import LocalLayerService
from map_api.services.whats_here_service import TOO_DETAILED_MESSAGE
from tests.utilities.factory_utils import factory_auth_header, factory_user, factory_user_layer


ENDPOINT = '/api/whats-here'
PIP = 'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP'
CARIBOU = 'WHSE_WILDLIFE_INVENTORY.GCPB_CARIBOU_POPULATION_SP'

FOOTPRINT = 'POLYGON((-123.1 48.9, -122.9 48.9, -122.9 49.1, -123.1 49.1, -123.1 48.9))'
INSIDE = 'POLYGON((-123.05 48.95, -122.95 48.95, -122.95 49.05, -123.05 49.05, -123.05 48.95))'
FAR_AWAY = 'POLYGON((-120.1 50.9, -119.9 50.9, -119.9 51.1, -120.1 51.1, -120.1 50.9))'

MAX_OUTLINE = 'map_api.services.whats_here_service.WHATS_HERE_MAX_OUTLINE_CHARS'


def circle(points=200):
    """Return a footprint with enough vertices to need simplifying."""
    ring = [
        (-123 + 0.05 * math.cos(2 * math.pi * i / points), 49 + 0.05 * math.sin(2 * math.pi * i / points))
        for i in range(points)
    ]
    ring.append(ring[0])
    return 'POLYGON((' + ', '.join(f'{x:.6f} {y:.6f}' for x, y in ring) + '))'


def insert_eao(feature_id, wkt=FOOTPRINT):
    """Store one EAO footprint."""
    db.session.execute(
        text("""
            INSERT INTO cache.eao_project_data (
                feature_id, source_layer, style_category, is_amendment, is_footprint,
                track_id, project_name, label, geom
            ) VALUES (
                :feature_id, 'polygon', 'footprint', false, true, 205, 'Nixon Road Wellsite',
                'Project Boundary', ST_Transform(ST_GeomFromText(:wkt, 4326), 3857)
            )
        """),
        {'feature_id': feature_id, 'wkt': wkt},
    )
    db.session.commit()


def insert_pip(guid, name, wkt):
    """Store one consultation area."""
    db.session.execute(
        text("""
            INSERT INTO cache.pip_consultation_areas (
                cnsltn_area_guid, cnsltn_area_name, cnsltn_area_mapsource, contact_type,
                contact_count, contacts, geom
            ) VALUES (
                :guid, :name, 'Mapped by EAO', 'Consultation Area Contact', 0, '[]'::jsonb,
                ST_Transform(ST_GeomFromText(:wkt, 4326), 3857)
            )
        """),
        {'guid': guid, 'name': name, 'wkt': wkt},
    )
    db.session.commit()


def insert_imported(layer_id, wkt):
    """Store one feature of an imported layer, in its storage projection."""
    return db.session.execute(
        text("""
            INSERT INTO user_layer_features (layer_id, geom, properties)
            VALUES (:layer_id, ST_Transform(ST_GeomFromText(:wkt, 4326), 3005), '{}'::jsonb)
            RETURNING id
        """),
        {'layer_id': layer_id, 'wkt': wkt},
    ).scalar()


def ask(client, jwt, **body):
    """POST a What's here query."""
    return client.post(ENDPOINT, json={'selection': ['{F1}'], **body}, headers=factory_auth_header(jwt))


def test_requires_a_token(app, client, session):
    """The layers and the selection are the user's own."""
    response = client.post(ENDPOINT, json={'selection': ['{F1}']})

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_a_query_with_no_selection_is_rejected(app, client, jwt, session):
    """Nothing selected is nothing to search with."""
    response = client.post(ENDPOINT, json={'selection': []}, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_the_selection_s_own_layer_is_not_searchable(app, client, jwt, session):
    """Searching it would only find the selection itself."""
    response = ask(client, jwt, hosted=['EAO.PROJECT_DATA'])

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_a_hosted_layer_asked_more_than_once_is_rejected(app, client, jwt, session):
    """One query per hosted layer, at most."""
    response = ask(client, jwt, hosted=[PIP, PIP])

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_lists_the_hosted_features_under_the_selection(app, client, jwt, session):
    """By name, with the match count; an area elsewhere is not listed."""
    insert_eao('{F1}')
    insert_pip('{P2}', 'Canim Lake Band', INSIDE)
    insert_pip('{P1}', 'Adams Lake Indian Band', FOOTPRINT)
    insert_pip('{P3}', 'Far Away Nation', FAR_AWAY)

    response = ask(client, jwt, hosted=[PIP])

    assert response.status_code == HTTPStatus.OK
    [result] = response.json['results']
    assert result['kind'] == 'hosted'
    assert result['layer'] == PIP
    assert result['status'] == 'found'
    assert result['matched'] == 2
    assert [(f['id'], f['name']) for f in result['features']] == [
        ('{P1}', 'Adams Lake Indian Band'),
        ('{P2}', 'Canim Lake Band'),
    ]


def test_a_layer_with_nothing_under_the_selection_is_empty(app, client, jwt, session):
    """Empty, not an error."""
    insert_eao('{F1}')
    insert_pip('{P3}', 'Far Away Nation', FAR_AWAY)

    [result] = ask(client, jwt, hosted=[PIP]).json['results']

    assert result['status'] == 'empty'
    assert result['features'] == []
    assert result['matched'] == 0


def test_lists_the_user_s_imported_features_under_the_selection(app, client, jwt, session):
    """By feature id; the client holds the rest."""
    insert_eao('{F1}')
    user = factory_user()
    layer = factory_user_layer(user.id)
    inside = insert_imported(layer.id, INSIDE)
    insert_imported(layer.id, FAR_AWAY)
    db.session.commit()

    [result] = ask(client, jwt, imported=[str(layer.id)]).json['results']

    assert result['kind'] == 'imported'
    assert result['layer'] == str(layer.id)
    assert [f['id'] for f in result['features']] == [str(inside)]
    assert result['matched'] == 1


def test_another_user_s_imported_layer_is_not_searched(app, client, jwt, session):
    """Reported missing, not read."""
    insert_eao('{F1}')
    other = factory_user(auth_guid=str(uuid.uuid4()), username='someone_else')
    layer = factory_user_layer(other.id)
    insert_imported(layer.id, INSIDE)
    db.session.commit()

    [result] = ask(client, jwt, imported=[str(layer.id)]).json['results']

    assert result['status'] == 'error'
    assert result['features'] == []


def test_only_the_asked_layer_s_features_are_listed(app, client, jwt, session):
    """Another layer under the selection, here someone else's, is not read."""
    insert_eao('{F1}')
    user = factory_user()
    layer = factory_user_layer(user.id)
    inside = insert_imported(layer.id, INSIDE)
    other = factory_user(auth_guid=str(uuid.uuid4()), username='someone_else')
    insert_imported(factory_user_layer(other.id).id, INSIDE)
    db.session.commit()

    [result] = ask(client, jwt, imported=[str(layer.id)]).json['results']

    assert [f['id'] for f in result['features']] == [str(inside)]
    assert result['matched'] == 1


def test_asks_the_warehouse_with_the_selection_s_outline(app, client, jwt, session):
    """In degrees."""
    insert_eao('{F1}')
    found = [{'id': f'{CARIBOU}.2694', 'name': 'Wells Gray South', 'properties': []}]

    with patch.object(BcgwService, 'intersecting', return_value=(found, 1)) as intersecting:
        [result] = ask(client, jwt, catalogue=[CARIBOU]).json['results']

    (object_name, outline), _ = intersecting.call_args
    assert object_name == CARIBOU
    assert outline.startswith('POLYGON((-123.1 48.9')
    assert result == {
        'kind': 'catalogue',
        'layer': CARIBOU,
        'status': 'found',
        'features': found,
        'matched': 1,
        'error': None,
    }


def test_a_selection_that_no_longer_exists_asks_the_warehouse_nothing(app, client, jwt, session):
    """Every warehouse layer is empty, unasked."""
    with patch.object(BcgwService, 'intersecting') as intersecting:
        [result] = ask(client, jwt, catalogue=[CARIBOU]).json['results']

    intersecting.assert_not_called()
    assert result['status'] == 'empty'


def test_a_detailed_outline_is_simplified_until_it_fits(app, client, jwt, session):
    """Too long as stored, so a coarser tolerance is what reaches the warehouse."""
    insert_eao('{F1}', circle())
    limit = 1000
    assert len(LocalLayerService.selection_outline(['{F1}'], 0)) > limit

    with patch(MAX_OUTLINE, limit), patch.object(BcgwService, 'intersecting', return_value=([], 0)) as intersecting:
        [result] = ask(client, jwt, catalogue=[CARIBOU]).json['results']

    (_, outline), _ = intersecting.call_args
    assert len(outline) <= limit
    assert result['status'] == 'empty'


def test_an_outline_too_detailed_at_every_tolerance_is_not_sent(app, client, jwt, session):
    """Each warehouse layer says so instead."""
    insert_eao('{F1}')

    with patch(MAX_OUTLINE, 10), patch.object(BcgwService, 'intersecting') as intersecting:
        results = ask(client, jwt, catalogue=[CARIBOU, 'WHSE_TEST.OTHER']).json['results']

    intersecting.assert_not_called()
    assert [(r['layer'], r['status'], r['error']) for r in results] == [
        (CARIBOU, 'error', TOO_DETAILED_MESSAGE),
        ('WHSE_TEST.OTHER', 'error', TOO_DETAILED_MESSAGE),
    ]


def test_one_warehouse_layer_failing_leaves_the_others(app, client, jwt, session):
    """Each layer carries its own outcome."""
    insert_eao('{F1}')

    def intersecting(object_name, _outline):
        if object_name == CARIBOU:
            raise RuntimeError('boom')
        return [], 0

    with patch.object(BcgwService, 'intersecting', side_effect=intersecting):
        results = ask(client, jwt, catalogue=[CARIBOU, 'WHSE_TEST.OTHER']).json['results']

    assert [(r['layer'], r['status']) for r in results] == [
        (CARIBOU, 'error'),
        ('WHSE_TEST.OTHER', 'empty'),
    ]


def test_feature_bounds_come_from_the_warehouse(app, client, jwt, session):
    """For framing one result."""
    with patch.object(BcgwService, 'feature_bounds', return_value=[-120.5, 51.5, -119.5, 52.5]):
        response = client.get(
            f'/api/catalogue/layers/{CARIBOU}/features/{CARIBOU}.2694/bounds',
            headers=factory_auth_header(jwt),
        )

    assert response.status_code == HTTPStatus.OK
    assert response.json == {'bounds': [-120.5, 51.5, -119.5, 52.5]}


def test_feature_bounds_refuse_another_layer_s_feature(app, client, jwt, session):
    """The id must be this layer's."""
    response = client.get(
        f'/api/catalogue/layers/{CARIBOU}/features/WHSE_TEST.OTHER.1/bounds',
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
