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
"""Tests for the favourite layer endpoints."""
from http import HTTPStatus

import pytest

from map_api.models.user import User
from map_api.models.user_favourite_layer import UserFavouriteLayer
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_auth_header, factory_favourite_folder,
    factory_favourite_layer, factory_user, idir_claims)


ENDPOINT = '/api/users/me/favourites'
ORDER_ENDPOINT = f'{ENDPOINT}/order'
FOLDERS_ENDPOINT = f'{ENDPOINT}/folders'
OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'
THIRD_OBJECT = 'WHSE_BASEMAPPING.GBA_RAILWAY_TRACKS_SP'


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


def star(client, headers, **overrides):
    """Star a layer and return the response body."""
    return client.post(
        ENDPOINT, json=bcdc_layer_payload(**overrides), headers=headers
    ).json


def new_folder(client, headers, **body):
    """Create a folder and return the response body."""
    return client.post(FOLDERS_ENDPOINT, json=body, headers=headers).json


def move(client, headers, favourite, folder_id):
    """File a favourite into a folder, or back out to the top level."""
    return client.patch(
        f"{ENDPOINT}/{favourite['id']}", json={'folder_id': folder_id}, headers=headers
    )


@pytest.mark.parametrize(
    'method, path',
    [
        ('get', ENDPOINT),
        ('post', ENDPOINT),
        ('put', ORDER_ENDPOINT),
        ('patch', f'{ENDPOINT}/1'),
        ('delete', f'{ENDPOINT}/1'),
    ],
)
def test_favourite_endpoints_require_a_token(app, client, session, method, path):
    """Nothing here is reachable without a verified token."""
    response = getattr(client, method)(path)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_get_returns_an_empty_list_for_a_new_user(app, client, jwt, session):
    """A user who has starred nothing has no favourites."""
    response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json == []


def test_the_first_favourite_call_provisions_the_staff_users_row(app, client, jwt, session):
    """A user who never called /users/me can still star a layer."""
    assert User.find_by_auth_guid(idir_claims()['preferred_username']) is None

    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert User.find_by_auth_guid(idir_claims()['preferred_username']) is not None


def test_post_stars_a_layer(app, client, jwt, session):
    """Starring a catalogue result stores it."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['display_name'] == 'Indian Reserves'
    assert response.json['sort_order'] == 1


def test_a_favourite_carries_no_opacity(app, client, jwt, session):
    """A favourite is not drawn, so it holds no render state."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(opacity=40), headers=factory_auth_header(jwt)
    )

    assert 'opacity' not in response.json


def test_post_of_an_already_starred_layer_returns_200(app, client, jwt, session):
    """Starring twice is not an error, and does not disturb the row."""
    headers = factory_auth_header(jwt)
    first = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    second = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    assert second.status_code == HTTPStatus.OK
    assert second.json['id'] == first.json['id']
    # A stray double click must not move the favourite down the list.
    assert second.json['sort_order'] == first.json['sort_order']


def test_starring_the_same_layer_twice_does_not_duplicate_it(app, client, jwt, session):
    """A layer is favourited once, however many times it is starred."""
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    assert len(client.get(ENDPOINT, headers=headers).json) == 1


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


def test_get_returns_favourites_newest_first(app, client, jwt, session):
    """The layer the user just starred leads, until they reorder them."""
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    client.post(
        ENDPOINT, json=bcdc_layer_payload(object_name=OTHER_OBJECT), headers=headers
    )

    response = client.get(ENDPOINT, headers=headers)

    assert [row['object_name'] for row in response.json] == [
        OTHER_OBJECT,
        bcdc_layer_payload()['object_name'],
    ]


@pytest.mark.parametrize('field', ['sort_order', 'user_id', 'source', 'id', 'folder_id'])
def test_post_ignores_server_owned_fields(app, client, jwt, session, field):
    """A client cannot choose its own position or identity."""
    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(**{field: 999}),
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['sort_order'] == 1
    assert response.json['source'] == 'bcdc'
    assert response.json['id'] != 999


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


@pytest.mark.parametrize(
    'package_id',
    [
        'clab-indian-reserves',                  # a slug, which a retitle changes
        '0a1b2c3d4e5f4a6b8c9d0e1f2a3b4c5d',      # a uuid without its dashes
        'g0a1b2c3-4e5f-4a6b-8c9d-0e1f2a3b4c5d',  # not hex
    ],
)
def test_post_rejects_a_package_id_that_is_not_a_uuid(app, client, jwt, session, package_id):
    """The uuid is what keeps the metadata link working after a retitle."""
    response = client.post(
        ENDPOINT,
        json=bcdc_layer_payload(package_id=package_id),
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


def test_post_refuses_past_the_favourite_cap(app, client, jwt, session, monkeypatch):
    """The guard rail reports as unprocessable, not as a bad request."""
    monkeypatch.setattr(
        'map_api.services.user_favourite_layer_service.MAX_FAVOURITE_LAYERS', 1
    )
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(object_name=OTHER_OBJECT), headers=headers
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


def test_put_order_reorders_the_favourites(app, client, jwt, session):
    """A drag persists, and the whole list comes back in the new order."""
    headers = factory_auth_header(jwt)
    first = star(client, headers)
    second = star(client, headers, object_name=OTHER_OBJECT)

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [second['id'], first['id']]},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.OK
    assert [row['id'] for row in response.json] == [second['id'], first['id']]
    assert [row['sort_order'] for row in response.json] == [1, 2]
    assert [row['id'] for row in client.get(ENDPOINT, headers=headers).json] == [
        second['id'], first['id'],
    ]


@pytest.mark.parametrize('body', [{}, {'favourite_ids': []}, {'favourite_ids': 'abc'}])
def test_put_order_rejects_a_malformed_body(app, client, jwt, session, body):
    """Validation failures are 400s, not 500s."""
    headers = factory_auth_header(jwt)
    star(client, headers)

    response = client.put(ORDER_ENDPOINT, json=body, headers=headers)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_put_order_rejects_a_stale_list(app, client, jwt, session):
    """A favourite removed in another tab is a 400, not a silent misorder."""
    headers = factory_auth_header(jwt)
    first = star(client, headers)
    second = star(client, headers, object_name=OTHER_OBJECT)
    client.delete(f"{ENDPOINT}/{second['id']}", headers=headers)

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [second['id'], first['id']]},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_put_order_cannot_reach_another_users_favourite(app, client, jwt, session):
    """Refused like any unknown id, and their list is untouched."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_layer(owner.id, sort_order=5)
    headers = factory_auth_header(jwt)
    star(client, headers)

    response = client.put(
        ORDER_ENDPOINT, json={'favourite_ids': [theirs.id]}, headers=headers
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    session.refresh(theirs)
    assert theirs.sort_order == 5


def test_delete_unstars_the_layer(app, client, jwt, session):
    """Un-starring deletes the row."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    response = client.delete(f"{ENDPOINT}/{created.json['id']}", headers=headers)

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert client.get(ENDPOINT, headers=headers).json == []


def test_delete_twice_is_idempotent(app, client, jwt, session):
    """The second call has nothing to remove, which is not an error."""
    headers = factory_auth_header(jwt)
    created = client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)
    path = f"{ENDPOINT}/{created.json['id']}"

    client.delete(path, headers=headers)

    assert client.delete(path, headers=headers).status_code == HTTPStatus.NO_CONTENT


def test_delete_an_unknown_id_is_no_content(app, client, jwt, session):
    """A favourite that never existed is already unstarred."""
    response = client.delete(f'{ENDPOINT}/999999', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT


def test_delete_another_users_favourite_leaves_the_row_alone(app, client, jwt, session):
    """204 like any other id - the response says nothing about who owns it."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    favourite = factory_favourite_layer(owner.id)

    response = client.delete(f'{ENDPOINT}/{favourite.id}', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert UserFavouriteLayer.find_one_for_user(favourite.id, owner.id) is not None


def test_a_favourite_is_only_visible_to_its_owner(app, client, jwt, session):
    """Two users' favourites do not see each other."""
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt))

    response = client.get(ENDPOINT, headers=second_user_auth_header(jwt))

    assert response.json == []


def test_favouriting_does_not_apply_the_layer_to_the_map(app, client, jwt, session):
    """Starring is a bookmark, not a request to draw the layer."""
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json=bcdc_layer_payload(), headers=headers)

    assert client.get('/api/users/me/layers', headers=headers).json == []


def test_a_non_numeric_favourite_id_is_not_found(app, client, jwt, session):
    """The int converter keeps a bad id out of the database."""
    response = client.delete(f'{ENDPOINT}/abc', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_a_new_favourite_is_at_the_top_level(app, client, jwt, session):
    """Starring files nothing: a layer arrives outside every folder."""
    response = client.post(
        ENDPOINT, json=bcdc_layer_payload(), headers=factory_auth_header(jwt)
    )

    assert response.json['folder_id'] is None


def test_patch_files_a_favourite_into_a_folder(app, client, jwt, session):
    """Dropping a layer on a folder is one request, and it sticks."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers, name='Wildfire')
    favourite = star(client, headers)

    response = move(client, headers, favourite, folder['id'])

    assert response.status_code == HTTPStatus.OK
    assert response.json['folder_id'] == folder['id']
    assert client.get(ENDPOINT, headers=headers).json[0]['folder_id'] == folder['id']


def test_a_favourite_lands_at_the_top_of_the_folder_it_arrives_in(app, client, jwt, session):
    """Positions are per container, so the first layer in a folder is 1."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    star(client, headers)
    second = star(client, headers, object_name=OTHER_OBJECT)

    response = move(client, headers, second, folder['id'])

    assert response.json['sort_order'] == 1


def test_a_favourite_is_in_one_folder_at_a_time(app, client, jwt, session):
    """Moving into a folder is what takes the layer out of the one before."""
    headers = factory_auth_header(jwt)
    first = new_folder(client, headers, name='Wildfire')
    second = new_folder(client, headers, name='Roads')
    favourite = star(client, headers)
    move(client, headers, favourite, first['id'])

    response = move(client, headers, favourite, second['id'])

    assert response.json['folder_id'] == second['id']


def test_patch_moves_a_favourite_back_to_the_top_level(app, client, jwt, session):
    """A null folder is the top level, not "leave it where it is"."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    favourite = star(client, headers)
    move(client, headers, favourite, folder['id'])

    response = move(client, headers, favourite, None)

    assert response.status_code == HTTPStatus.OK
    assert response.json['folder_id'] is None


def test_moving_a_favourite_does_not_un_favourite_it(app, client, jwt, session):
    """Filing is not starring: the row is the same one, still in the list."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    favourite = star(client, headers)

    response = move(client, headers, favourite, folder['id'])

    assert response.json['id'] == favourite['id']
    assert len(client.get(ENDPOINT, headers=headers).json) == 1


def test_patch_rejects_a_body_without_a_folder(app, client, jwt, session):
    """folder_id is required, so a client always says which container it means."""
    headers = factory_auth_header(jwt)
    favourite = star(client, headers)

    response = client.patch(f"{ENDPOINT}/{favourite['id']}", json={}, headers=headers)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_patch_rejects_an_unknown_folder(app, client, jwt, session):
    """A folder deleted in another tab is a 400, not a layer filed nowhere."""
    headers = factory_auth_header(jwt)
    favourite = star(client, headers)

    response = move(client, headers, favourite, 999999)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_patch_cannot_file_a_favourite_into_another_users_folder(app, client, jwt, session):
    """Refused like any unknown folder, and the favourite does not move."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_folder(owner.id)
    headers = factory_auth_header(jwt)
    favourite = star(client, headers)

    response = move(client, headers, favourite, theirs.id)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert client.get(ENDPOINT, headers=headers).json[0]['folder_id'] is None


def test_patch_of_an_unknown_favourite_is_not_found(app, client, jwt, session):
    """There is nothing to file."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)

    response = client.patch(
        f'{ENDPOINT}/999999', json={'folder_id': folder['id']}, headers=headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_patch_cannot_reach_another_users_favourite(app, client, jwt, session):
    """Refused like any unknown id, and their favourite is untouched."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_layer(owner.id)
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)

    response = client.patch(
        f'{ENDPOINT}/{theirs.id}', json={'folder_id': folder['id']}, headers=headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    session.refresh(theirs)
    assert theirs.folder_id is None


def test_put_order_reorders_inside_a_folder(app, client, jwt, session):
    """A drag within a folder renumbers that folder and nothing else."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    first = star(client, headers)
    second = star(client, headers, object_name=OTHER_OBJECT)
    for favourite in (first, second):
        move(client, headers, favourite, folder['id'])

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [first['id'], second['id']], 'folder_id': folder['id']},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.OK
    assert [row['id'] for row in response.json] == [first['id'], second['id']]
    assert [row['sort_order'] for row in response.json] == [1, 2]


def test_put_order_returns_only_the_folder_it_reordered(app, client, jwt, session):
    """The response is the container the client sent, not the whole list."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    inside = star(client, headers)
    star(client, headers, object_name=OTHER_OBJECT)
    move(client, headers, inside, folder['id'])

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [inside['id']], 'folder_id': folder['id']},
        headers=headers,
    )

    assert [row['id'] for row in response.json] == [inside['id']]


def test_put_order_rejects_an_id_from_another_container(app, client, jwt, session):
    """A reorder cannot quietly move a layer between folders; that is a PATCH."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    inside = star(client, headers)
    outside = star(client, headers, object_name=OTHER_OBJECT)
    move(client, headers, inside, folder['id'])

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [inside['id'], outside['id']], 'folder_id': folder['id']},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_put_order_at_the_top_level_ignores_what_is_in_folders(app, client, jwt, session):
    """The top level is a container like any other, so a filed layer is not in it."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    filed = star(client, headers)
    first = star(client, headers, object_name=OTHER_OBJECT)
    second = star(client, headers, object_name=THIRD_OBJECT)
    move(client, headers, filed, folder['id'])

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [first['id'], second['id']]},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.OK
    assert [row['id'] for row in response.json] == [first['id'], second['id']]


def test_put_order_rejects_another_users_folder(app, client, jwt, session):
    """Refused like any unknown folder, before any position is written."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_folder(owner.id)
    headers = factory_auth_header(jwt)
    favourite = star(client, headers)

    response = client.put(
        ORDER_ENDPOINT,
        json={'favourite_ids': [favourite['id']], 'folder_id': theirs.id},
        headers=headers,
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_folder_membership_survives_a_reload(app, client, jwt, session):
    """What the panel reopens with is what map-api stored."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers, name='Wildfire')
    favourite = star(client, headers)
    move(client, headers, favourite, folder['id'])

    folders = client.get(FOLDERS_ENDPOINT, headers=headers).json
    favourites = client.get(ENDPOINT, headers=headers).json

    assert [row['name'] for row in folders] == ['Wildfire']
    assert [row['folder_id'] for row in favourites] == [folder['id']]
