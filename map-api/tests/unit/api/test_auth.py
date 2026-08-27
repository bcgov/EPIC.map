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
"""Tests for the IDIR sign-in gate in front of the API.

These cover the checks that happen before any handler runs, so none of them
need a database.
"""
from http import HTTPStatus

import pytest

from tests.utilities.factory_utils import factory_auth_header, idir_claims


ENDPOINT = '/api/users/me'


class _StubUser:  # pylint: disable=too-few-public-methods
    """Stands in for the local profile row GET /users/me would create."""

    id = 1
    first_name = 'Jane'
    last_name = 'Smith'
    username = 'JSMITH'
    email_address = 'jane.smith@gov.bc.ca'
    auth_guid = 'a1b2c3d4e5f60718293a4b5c6d7e8f90@idir'
    is_active = True


@pytest.fixture()
def stub_user_sync(monkeypatch):
    """Stub the local profile upsert so the gate can be tested without a database."""
    monkeypatch.setattr(
        'map_api.resources.user.UserService.sync_user_from_token',
        lambda token_info: _StubUser(),
    )


def test_ops_is_reachable_without_a_token(client):
    """Health probes must not be behind the token check."""
    response = client.get('/ops/healthz')

    assert response.status_code != HTTPStatus.UNAUTHORIZED


def test_missing_authorization_header_is_rejected(client):
    """A request with no token never reaches a handler."""
    response = client.get(ENDPOINT)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.parametrize(
    'header',
    [
        {'Authorization': 'garbage'},
        {'Authorization': 'Basic dXNlcjpwYXNz'},
        {'Authorization': 'Bearer not-a-jwt'},
    ],
)
def test_malformed_authorization_header_is_rejected(client, header):
    """Anything that is not a bearer JWT is a 401, not a 500."""
    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_expired_token_is_rejected(client, jwt):
    """Expiry is enforced, so an old token cannot be replayed."""
    header = factory_auth_header(jwt, claims=idir_claims(exp=1))

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_any_realm_token_is_accepted_while_group_gating_is_off(
    app, client, jwt, monkeypatch, stub_user_sync
):  # pylint: disable=unused-argument
    """AUTH_REQUIRED_GROUP unset means groups are not consulted at all.

    This is the current state: the realm has no group for EPIC.map yet, so any
    valid IDIR token from it gets in.
    """
    monkeypatch.setitem(app.config, 'AUTH_REQUIRED_GROUP', '')
    header = factory_auth_header(jwt, groups=['/EPIC/COMPLIANCE/user'])

    response = client.get('/api/users/me', headers=header)

    assert response.status_code != HTTPStatus.FORBIDDEN


def test_token_from_another_epic_app_is_rejected_when_a_group_is_required(
    app, client, jwt, monkeypatch
):
    """With the group set, the shared realm stops being a way in."""
    monkeypatch.setitem(app.config, 'AUTH_REQUIRED_GROUP', 'MAP')
    header = factory_auth_header(jwt, groups=['/EPIC/COMPLIANCE/user'])

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_token_with_no_groups_is_rejected_when_a_group_is_required(
    app, client, jwt, monkeypatch
):
    """A user who has authenticated but has no access is told so, not let in."""
    monkeypatch.setitem(app.config, 'AUTH_REQUIRED_GROUP', 'MAP')
    header = factory_auth_header(jwt, groups=[])

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_map_group_is_accepted_when_a_group_is_required(
    app, client, jwt, monkeypatch, stub_user_sync
):  # pylint: disable=unused-argument
    """The group is matched against the whole path, wherever MAP sits in it."""
    monkeypatch.setitem(app.config, 'AUTH_REQUIRED_GROUP', 'MAP')
    header = factory_auth_header(jwt, groups=['/EPIC/MAP/user'])

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code != HTTPStatus.FORBIDDEN


def test_signed_in_user_is_returned_with_their_permissions(
    client, jwt, stub_user_sync
):  # pylint: disable=unused-argument
    """The happy path: a signed-in IDIR user reaches the handler."""
    header = factory_auth_header(jwt)

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.OK
    body = response.get_json()
    assert body['username'] == 'JSMITH'
    assert body['permissions'] == ['User']


def test_a_user_with_no_client_roles_still_gets_the_default_permission(
    client, jwt, stub_user_sync
):  # pylint: disable=unused-argument
    """Roles are TBD, so a token carrying none is a plain user, not a nobody."""
    header = factory_auth_header(jwt, resource_access={})

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.OK
    assert response.get_json()['permissions'] == ['User']
