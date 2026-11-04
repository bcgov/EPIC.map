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
"""Tests for editing and deleting a user."""
from http import HTTPStatus

import pytest

from map_api.models.user import User
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, TEST_IDIR_USERNAME, factory_auth_header, factory_user)


ENDPOINT = '/api/users'


def own_id(client, headers):
    """Return the signed-in user's id, provisioning their record."""
    return client.get(f'{ENDPOINT}/me', headers=headers).json['id']


@pytest.mark.parametrize('method', ['get', 'post'])
def test_listing_and_creating_users_are_gone(app, client, jwt, session, method):
    """No user can list or create users."""
    response = getattr(client, method)(ENDPOINT, json={}, headers=factory_auth_header(jwt))

    assert response.status_code in (HTTPStatus.NOT_FOUND, HTTPStatus.METHOD_NOT_ALLOWED)


def test_reading_another_user_is_gone(app, client, jwt, session):
    """Their record exists, so only a missing GET handler explains the refusal."""
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    response = client.get(f'{ENDPOINT}/{other.id}', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_patch_updates_the_signed_in_user(app, client, jwt, session):
    """A user can edit their own record."""
    headers = factory_auth_header(jwt)
    user_id = own_id(client, headers)

    response = client.patch(f'{ENDPOINT}/{user_id}', json={'contact_number': '250-555-0100'}, headers=headers)

    assert response.status_code == HTTPStatus.OK
    assert response.json['contact_number'] == '250-555-0100'


def test_patch_cannot_change_what_idir_owns(app, client, jwt, session):
    """Names, email and username come from IDIR; username is also how sign-in claims a record."""
    headers = factory_auth_header(jwt)
    user_id = own_id(client, headers)
    idir_fields = {
        'first_name': 'Mallory',
        'middle_name': 'M',
        'last_name': 'Jones',
        'email_address': 'mallory@example.com',
        'username': SECOND_IDIR_USERNAME,
    }

    response = client.patch(f'{ENDPOINT}/{user_id}', json=idir_fields, headers=headers)

    assert response.status_code == HTTPStatus.OK
    assert response.json['first_name'] == 'Jane'
    assert response.json.get('middle_name') is None
    assert response.json['last_name'] == 'Smith'
    assert response.json['email_address'] == 'jane.smith@gov.bc.ca'
    assert response.json['username'] == TEST_IDIR_USERNAME


def test_patch_cannot_reach_another_user(app, client, jwt, session):
    """Refused like any unknown id, and their record is untouched."""
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    response = client.patch(
        f'{ENDPOINT}/{other.id}', json={'first_name': 'Mallory'}, headers=factory_auth_header(jwt)
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    session.refresh(other)
    assert other.first_name == 'Jane'


def test_delete_removes_the_signed_in_user(app, client, jwt, session):
    """A user can delete their own record."""
    headers = factory_auth_header(jwt)
    user_id = own_id(client, headers)

    response = client.delete(f'{ENDPOINT}/{user_id}', headers=headers)

    assert response.status_code == HTTPStatus.OK
    assert User.find_by_id(user_id) is None


def test_delete_cannot_reach_another_user(app, client, jwt, session):
    """Refused like any unknown id, and their record is still there."""
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    response = client.delete(f'{ENDPOINT}/{other.id}', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert User.find_by_id(other.id) is not None
