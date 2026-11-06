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
import logging
from http import HTTPStatus

import pytest

from tests.utilities.factory_utils import factory_auth_header, idir_claims


ALLOWED_CLIENTS = ['epic-centre', 'map-web']


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


@pytest.mark.parametrize('path', ['/ops/delay/1', '/ops/db-delay/1', '/ops/random-message'])
def test_ops_serves_no_test_endpoints(client, path):
    """/ops is unauthenticated, so anything that holds a thread open there is a DoS."""
    response = client.get(path)

    assert response.status_code == HTTPStatus.NOT_FOUND


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


@pytest.mark.parametrize(
    'groups',
    [[], ['/TRACK'], ['/TRACK/NO_ROLE'], ['/COMPLIANCE/USER'], ['/SUBMIT/EAO_STAFF']],
)
def test_a_centre_token_without_a_track_role_is_rejected(client, jwt, groups):
    """Centre signs in every IDIR user, so the map checks for a Track role itself."""
    header = factory_auth_header(jwt, azp='epic-centre', groups=groups)

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.FORBIDDEN


@pytest.mark.parametrize('groups', [['/TRACK/VIEWER'], ['/TRACK/SUPER_USER']])
def test_a_centre_token_with_a_track_role_is_accepted(
    client, jwt, stub_user_sync, groups
):  # pylint: disable=unused-argument
    """Any Track role other than NO_ROLE can use the map."""
    header = factory_auth_header(jwt, azp='epic-centre', groups=groups)

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.OK


@pytest.mark.parametrize('host', ['epic-submit', 'epictrack-web', 'epic-compliance'])
def test_a_token_from_an_app_that_does_not_host_the_map_is_rejected(client, jwt, host):
    """Only Centre and map-web host the map for now, even when aud names Centre too."""
    header = factory_auth_header(jwt, aud=[host, 'account', 'epic-centre'], azp=host)

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_a_refused_client_is_logged_by_its_azp(app, client, jwt, caplog, monkeypatch):
    """The log names the app that was turned away, so an allowlist mismatch is easy to spot."""
    # Alembic's fileConfig disables existing loggers once a test has run migrations.
    monkeypatch.setattr(app.logger, 'disabled', False)
    header = factory_auth_header(jwt, aud=['account', 'epic-centre'], azp='epic-submit')

    with caplog.at_level(logging.WARNING):
        response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert 'azp epic-submit is not in ALLOWED_CLIENT_IDS' in caplog.text


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


def test_client_roles_in_the_token_do_not_change_permissions(
    client, jwt, stub_user_sync
):  # pylint: disable=unused-argument
    """resource_access is not read at all, so an admin role grants nothing here.

    Client roles are scoped per keycloak client. Reading them would mean the
    same officer got different access depending on which EPIC application they
    opened the map in, so the API ignores them until a role source exists that
    means the same thing everywhere.
    """
    header = factory_auth_header(
        jwt,
        resource_access={'map-web': {'roles': ['admin', 'super_user']}},
    )

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.OK
    assert response.get_json()['permissions'] == ['User']


@pytest.mark.parametrize('allowed_client', ALLOWED_CLIENTS)
def test_a_token_from_each_allowed_client_is_accepted(
    app, client, jwt, monkeypatch, stub_user_sync, allowed_client
):  # pylint: disable=unused-argument,too-many-arguments
    """Every EPIC application signs in against its own client in the shared realm."""
    monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWED_CLIENTS)
    header = factory_auth_header(jwt, azp=allowed_client)

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.OK


def test_a_token_from_an_unlisted_client_is_rejected(app, client, jwt, monkeypatch):
    """A genuine realm token from a client this API does not serve is a 401.

    The signature, issuer and expiry are all fine here - only the client is
    wrong, which is exactly the case the allowlist exists to catch.
    """
    monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWED_CLIENTS)
    header = factory_auth_header(jwt, aud='account', azp='some-other-app')

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_a_token_from_another_realm_is_rejected(app, client, jwt, monkeypatch):
    """Issuer validation is unchanged: a token minted elsewhere does not get in.

    The client is on the allowlist and the token is signed with the key this
    suite trusts, so the only thing wrong is where it came from.
    """
    monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWED_CLIENTS)
    header = factory_auth_header(
        jwt,
        claims=idir_claims(
            iss='https://dev.loginproxy.gov.bc.ca/auth/realms/some-other-realm',
            azp='map-web',
        ),
    )

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_an_expired_token_from_an_allowed_client_is_still_rejected(
    app, client, jwt, monkeypatch
):
    """Being on the allowlist does not excuse an expired token."""
    monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWED_CLIENTS)
    header = factory_auth_header(jwt, claims=idir_claims(azp='map-web', exp=1))

    response = client.get(ENDPOINT, headers=header)

    assert response.status_code == HTTPStatus.UNAUTHORIZED
