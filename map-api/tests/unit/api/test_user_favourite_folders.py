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
"""Tests for the favourite folder endpoints."""
from http import HTTPStatus

import pytest

from map_api.models.user_favourite_folder import UserFavouriteFolder
from map_api.utils.constant import DEFAULT_FOLDER_NAME, MAX_FOLDER_NAME_LENGTH
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_auth_header, factory_favourite_folder,
    factory_user, idir_claims)


FAVOURITES = '/api/users/me/favourites'
ENDPOINT = f'{FAVOURITES}/folders'
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


def new_folder(client, headers, **body):
    """Create a folder and return the response body."""
    return client.post(ENDPOINT, json=body, headers=headers).json


def star(client, headers, **overrides):
    """Star a layer and return the response body."""
    return client.post(
        FAVOURITES, json=bcdc_layer_payload(**overrides), headers=headers
    ).json


@pytest.mark.parametrize(
    'method, path',
    [
        ('get', ENDPOINT),
        ('post', ENDPOINT),
        ('patch', f'{ENDPOINT}/1'),
        ('delete', f'{ENDPOINT}/1'),
    ],
)
def test_folder_endpoints_require_a_token(app, client, session, method, path):
    """Nothing here is reachable without a verified token."""
    response = getattr(client, method)(path)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_get_returns_an_empty_list_for_a_new_user(app, client, jwt, session):
    """A user who has made no folders has none."""
    response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json == []


def test_the_first_folder_call_provisions_the_staff_users_row(app, client, jwt, session):
    """A user who never called /users/me can still make a folder."""
    response = client.post(ENDPOINT, json={}, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.CREATED


def test_post_creates_a_named_folder(app, client, jwt, session):
    """The name the user typed is what is stored."""
    response = client.post(
        ENDPOINT, json={'name': 'Wildfire'}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['name'] == 'Wildfire'
    assert response.json['is_collapsed'] is False


@pytest.mark.parametrize('body', [{}, {'name': ''}, {'name': '   '}, {'name': None}])
def test_post_without_a_name_falls_back_to_the_default(app, client, jwt, session, body):
    """A folder committed with nothing typed is still a folder."""
    response = client.post(ENDPOINT, json=body, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['name'] == DEFAULT_FOLDER_NAME


def test_post_trims_the_name(app, client, jwt, session):
    """Stray whitespace around a name is not part of it."""
    response = client.post(
        ENDPOINT, json={'name': '  Wildfire  '}, headers=factory_auth_header(jwt)
    )

    assert response.json['name'] == 'Wildfire'


def test_post_rejects_a_name_past_the_column_length(app, client, jwt, session):
    """Refused as a bad request rather than truncated or 500ing on insert."""
    response = client.post(
        ENDPOINT,
        json={'name': 'W' * (MAX_FOLDER_NAME_LENGTH + 1)},
        headers=factory_auth_header(jwt),
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_two_folders_may_share_a_name(app, client, jwt, session):
    """The default name is shared by every unnamed folder, so it cannot be unique."""
    headers = factory_auth_header(jwt)
    first = new_folder(client, headers)
    second = new_folder(client, headers)

    assert first['id'] != second['id']
    assert len(client.get(ENDPOINT, headers=headers).json) == 2


def test_a_new_folder_leads_the_list(app, client, jwt, session):
    """A folder the user just made is the one they are naming, so it is on top."""
    headers = factory_auth_header(jwt)
    first = new_folder(client, headers, name='Wildfire')
    second = new_folder(client, headers, name='Roads')

    response = client.get(ENDPOINT, headers=headers)

    assert [row['id'] for row in response.json] == [second['id'], first['id']]


@pytest.mark.parametrize('field', ['sort_order', 'user_id', 'id', 'is_collapsed'])
def test_post_ignores_server_owned_fields(app, client, jwt, session, field):
    """A client cannot choose its own position or identity."""
    response = client.post(
        ENDPOINT, json={'name': 'Wildfire', field: 999}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json['sort_order'] == 1
    assert response.json['is_collapsed'] is False
    assert response.json['id'] != 999


def test_the_response_does_not_expose_the_user_id(app, client, jwt, session):
    """The caller is the user; echoing their row id tells them nothing."""
    response = client.post(ENDPOINT, json={}, headers=factory_auth_header(jwt))

    assert 'user_id' not in response.json


def test_post_refuses_past_the_folder_cap(app, client, jwt, session, monkeypatch):
    """The guard rail reports as unprocessable, not as a bad request."""
    monkeypatch.setattr(
        'map_api.services.user_favourite_folder_service.MAX_FAVOURITE_FOLDERS', 1
    )
    headers = factory_auth_header(jwt)
    client.post(ENDPOINT, json={}, headers=headers)

    response = client.post(ENDPOINT, json={}, headers=headers)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


def test_patch_renames_a_folder(app, client, jwt, session):
    """A committed name replaces the one before it."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)

    response = client.patch(
        f"{ENDPOINT}/{folder['id']}", json={'name': 'Wildfire'}, headers=headers
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json['name'] == 'Wildfire'
    assert client.get(ENDPOINT, headers=headers).json[0]['name'] == 'Wildfire'


@pytest.mark.parametrize('name', ['', '   ', None])
def test_patch_with_an_empty_name_falls_back_to_the_default(app, client, jwt, session, name):
    """Committing an empty field leaves a named folder, not a blank one."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers, name='Wildfire')

    response = client.patch(
        f"{ENDPOINT}/{folder['id']}", json={'name': name}, headers=headers
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json['name'] == DEFAULT_FOLDER_NAME


def test_patch_collapses_a_folder(app, client, jwt, session):
    """The chevron state is stored, so the panel reopens as the user left it."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers, name='Wildfire')

    response = client.patch(
        f"{ENDPOINT}/{folder['id']}", json={'is_collapsed': True}, headers=headers
    )

    assert response.json['is_collapsed'] is True
    assert client.get(ENDPOINT, headers=headers).json[0]['is_collapsed'] is True


def test_collapsing_a_folder_does_not_rename_it(app, client, jwt, session):
    """Only what the client sent is touched - an absent name is not a blank one."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers, name='Wildfire')

    response = client.patch(
        f"{ENDPOINT}/{folder['id']}", json={'is_collapsed': True}, headers=headers
    )

    assert response.json['name'] == 'Wildfire'


def test_patch_rejects_an_empty_body(app, client, jwt, session):
    """A PATCH that asks for nothing is a client bug, reported as one."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)

    response = client.patch(f"{ENDPOINT}/{folder['id']}", json={}, headers=headers)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_patch_of_an_unknown_folder_is_not_found(app, client, jwt, session):
    """There is nothing to rename."""
    response = client.patch(
        f'{ENDPOINT}/999999', json={'name': 'Wildfire'}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_patch_cannot_reach_another_users_folder(app, client, jwt, session):
    """Refused like any unknown id, and their folder is untouched."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_folder(owner.id, name='Theirs')

    response = client.patch(
        f'{ENDPOINT}/{theirs.id}', json={'name': 'Mine'}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    session.refresh(theirs)
    assert theirs.name == 'Theirs'


def test_delete_removes_the_folder(app, client, jwt, session):
    """Deleting a folder takes it out of the list."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)

    response = client.delete(f"{ENDPOINT}/{folder['id']}", headers=headers)

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert client.get(ENDPOINT, headers=headers).json == []


def test_delete_leaves_the_layers_favourited(app, client, jwt, session):
    """A folder is a container: losing it must not un-favourite anything."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    favourite = star(client, headers)
    client.patch(
        f"{FAVOURITES}/{favourite['id']}", json={'folder_id': folder['id']}, headers=headers
    )

    client.delete(f"{ENDPOINT}/{folder['id']}", headers=headers)

    favourites = client.get(FAVOURITES, headers=headers).json
    assert [row['id'] for row in favourites] == [favourite['id']]
    assert favourites[0]['folder_id'] is None


def test_delete_twice_is_idempotent(app, client, jwt, session):
    """The second call has nothing to remove, which is not an error."""
    headers = factory_auth_header(jwt)
    folder = new_folder(client, headers)
    path = f"{ENDPOINT}/{folder['id']}"

    client.delete(path, headers=headers)

    assert client.delete(path, headers=headers).status_code == HTTPStatus.NO_CONTENT


def test_delete_an_unknown_id_is_no_content(app, client, jwt, session):
    """A folder that never existed is already gone."""
    response = client.delete(f'{ENDPOINT}/999999', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT


def test_delete_another_users_folder_leaves_it_alone(app, client, jwt, session):
    """204 like any other id - the response says nothing about who owns it."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_folder(owner.id)

    response = client.delete(f'{ENDPOINT}/{theirs.id}', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert UserFavouriteFolder.find_one_for_user(theirs.id, owner.id) is not None


def test_a_folder_is_only_visible_to_its_owner(app, client, jwt, session):
    """Two users' folders do not see each other."""
    client.post(ENDPOINT, json={'name': 'Wildfire'}, headers=factory_auth_header(jwt))

    response = client.get(ENDPOINT, headers=second_user_auth_header(jwt))

    assert response.json == []


def test_a_non_numeric_folder_id_is_not_found(app, client, jwt, session):
    """The int converter keeps a bad id out of the database."""
    response = client.delete(f'{ENDPOINT}/abc', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_folders_do_not_collide_with_a_favourite_id(app, client, jwt, session):
    """'folders' is not an int, so the two routes under /favourites stay apart."""
    headers = factory_auth_header(jwt)
    new_folder(client, headers, name='Wildfire')

    assert client.get(ENDPOINT, headers=headers).status_code == HTTPStatus.OK
    assert client.get(FAVOURITES, headers=headers).json == []
