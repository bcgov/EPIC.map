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
"""Tests for the applied layer endpoints."""
from http import HTTPStatus

import pytest

from map_api.models.user import User
from map_api.models.user_applied_layer import UserAppliedLayer
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_applied_layer, factory_auth_header,
    factory_user, idir_claims)


ENDPOINT = '/api/users/me/layers'
OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


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
        ('post', ENDPOINT),
        ('patch', f'{ENDPOINT}/1'),
        ('delete', f'{ENDPOINT}/1'),
    ],
)
def test_layer_endpoints_require_a_token(app, client, session, method, path):
    """Nothing here is reachable without a verified token."""
    response = getattr(client, method)(path)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_get_returns_an_empty_list_for_a_new_user(app, client, jwt, session):
    """A user who has applied nothing has an empty map."""
    response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json == []


def test_the_first_layer_call_provisions_the_staff_users_row(app, client, jwt, session):
    """A user who never called /users/me can still apply a layer."""
    assert User.find_by_auth_guid(idir_claims()['preferred_username']) is None

    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert User.find_by_auth_guid(idir_claims()['preferred_username']) is not None


def test_post_applies_a_layer(app, client, jwt, session):
    """Toggling a layer on stores it."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['display_name'] == 'Indian Reserves'
    assert response.json['opacity'] == 100
    assert response.json['sort_order'] == 1


def test_post_of_an_already_applied_layer_returns_200(app, client, jwt, session):
    """Re-applying is not an error, and does not disturb the row."""
    headers = factory_auth_header(jwt)
    first = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    client.patch(
        f"{ENDPOINT}/{first.json['id']}", json={'opacity': 40}, headers=headers
    )

    second = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    assert second.status_code == HTTPStatus.OK
    assert second.json['id'] == first.json['id']
    # A stray double submit must not reset the opacity or reorder the stack.
    assert second.json['opacity'] == 40
    assert second.json['sort_order'] == first.json['sort_order']


def test_the_response_carries_no_urls(app, client, jwt, session):
    """Identifiers are stored; the client builds the addresses."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    for key, value in response.json.items():
        assert 'url' not in key.lower()
        assert not (isinstance(value, str) and value.startswith('http'))


def test_the_response_does_not_expose_the_user_id(app, client, jwt, session):
    """The caller is the user; echoing their row id tells them nothing."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert 'user_id' not in response.json


def test_get_returns_layers_in_stacking_order(app, client, jwt, session):
    """Bottom of the stack first, most recently applied last."""
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    client.post(
        ENDPOINT,
        json=bcdc_layer_payload(object_name=OTHER_OBJECT),
        headers=headers,
    )

    response = client.get(ENDPOINT, headers=headers)

    assert [layer['object_name'] for layer in response.json] == [
        bcdc_layer_payload()['object_name'],
        OTHER_OBJECT,
    ]


def test_applying_the_same_layer_twice_does_not_duplicate_it(app, client, jwt, session):
    """A layer is on the map once, however many times it is applied."""
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    assert len(client.get(ENDPOINT, headers=headers).json) == 1


@pytest.mark.parametrize('field', ['sort_order', 'user_id', 'source', 'id', 'project_id'])
def test_post_ignores_server_owned_fields(app, client, jwt, session, field):
    """A client cannot choose its own stacking position or identity."""
    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(**{field: 999}),
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['sort_order'] == 1
    assert response.json['source'] == 'bcdc'
    assert response.json['id'] != 999


@pytest.mark.parametrize('opacity', [-1, 101, 'high'])
def test_post_rejects_opacity_out_of_range(app, client, jwt, session, opacity):
    """Validation failures are 400s, not 500s."""
    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(opacity=opacity),
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json['status'] == HTTPStatus.BAD_REQUEST.value


@pytest.mark.parametrize(
    'object_name',
    [
        'othernamespace:LAYER',       # escaping the prefix the client adds
        'LAYER_A,LAYER_B',            # several layers in one LAYERS parameter
        'WHSE/../etc',                # escaping the parameter into the path
        'WHSE ADMIN',                 # whitespace
        'WHSE?a=b',                   # escaping into the query string
    ],
)
def test_post_rejects_an_unsafe_object_name(app, client, jwt, session, object_name):
    """The charset rule is what makes not storing the URL worth doing."""
    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(object_name=object_name),
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.parametrize('field', ['package_id', 'object_name', 'display_name'])
def test_post_rejects_a_missing_required_field(app, client, jwt, session, field):
    """Every identifier the client is trusted for must be present."""
    payload = bcdc_layer_payload()
    payload.pop(field)

    response = client.post(ENDPOINT, json=payload, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_post_rejects_a_missing_body(app, client, jwt, session):
    """An empty POST is a client bug, reported as one."""
    response = client.post(ENDPOINT, json={}, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_post_refuses_past_the_layer_cap(app, client, jwt, session, monkeypatch):
    """The guard rail reports as unprocessable, not as a bad request."""
    monkeypatch.setattr(
        'map_api.services.user_applied_layer_service.MAX_APPLIED_LAYERS_PER_MAP', 1
    )
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(object_name=OTHER_OBJECT),
        headers=headers,
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


def test_patch_updates_the_opacity(app, client, jwt, session):
    """Dragging the slider persists."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.patch(
        f"{ENDPOINT}/{created.json['id']}", json={'opacity': 60}, headers=headers
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json['opacity'] == 60


def test_patch_without_an_opacity_is_rejected(app, client, jwt, session):
    """A PATCH that changes nothing is a client bug."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.patch(
        f"{ENDPOINT}/{created.json['id']}", json={}, headers=headers
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_patch_an_unknown_id_is_not_found(app, client, jwt, session):
    """A layer that never existed is a 404."""
    response = client.patch(
        f'{ENDPOINT}/999999', json={'opacity': 50}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_patch_another_users_layer_is_not_found_rather_than_forbidden(
    app, client, jwt, session
):
    """404, not 403 - a 403 would confirm the row exists."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    layer = factory_applied_layer(owner.id)

    response = client.patch(
        f'{ENDPOINT}/{layer.id}', json={'opacity': 10}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    session.refresh(layer)
    assert layer.opacity == 100


def test_delete_removes_the_layer(app, client, jwt, session):
    """Toggling a layer off deletes the row."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.delete(f"{ENDPOINT}/{created.json['id']}", headers=headers)

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert client.get(ENDPOINT, headers=headers).json == []


def test_delete_twice_is_not_found_the_second_time(app, client, jwt, session):
    """The row is gone, so the second call has nothing to remove."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    path = f"{ENDPOINT}/{created.json['id']}"

    client.delete(path, headers=headers)

    assert client.delete(path, headers=headers).status_code == HTTPStatus.NOT_FOUND


def test_delete_another_users_layer_is_not_found(app, client, jwt, session):
    """And leaves the row where it was."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    layer = factory_applied_layer(owner.id)

    response = client.delete(
        f'{ENDPOINT}/{layer.id}', headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert UserAppliedLayer.find_one_for_user(layer.id, owner.id) is not None


def test_a_layer_is_only_visible_to_its_owner(app, client, jwt, session):
    """Two users' maps do not see each other."""
    client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    response = client.get(ENDPOINT, headers=second_user_auth_header(jwt))

    assert response.json == []


def test_a_non_numeric_layer_id_is_not_found(app, client, jwt, session):
    """The int converter keeps a bad id out of the database."""
    response = client.delete(f'{ENDPOINT}/abc', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND
