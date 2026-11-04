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
"""Tests for reading IDIR claims out of an access token."""
import pytest

from map_api.utils import token as token_utils

from tests.utilities.factory_utils import TEST_AUTH_GUID, TEST_IDIR_USERNAME, idir_claims


def test_user_data_maps_idir_claims_onto_the_local_record(app):
    """The local profile is filled from the token, not from user input."""
    with app.app_context():
        user_data = token_utils.user_data_from_token(idir_claims())

    assert user_data == {
        'auth_guid': TEST_AUTH_GUID,
        'username': TEST_IDIR_USERNAME,
        'first_name': 'Jane',
        'last_name': 'Smith',
        'email_address': 'jane.smith@gov.bc.ca',
    }


def test_username_falls_back_to_preferred_username(app):
    """Not every identity provider in the realm sends idir_username."""
    claims = idir_claims()
    del claims['idir_username']

    with app.app_context():
        assert token_utils.idir_username(claims) == TEST_AUTH_GUID


@pytest.mark.parametrize(
    'groups,expected',
    [
        (['/TRACK/VIEWER'], True),
        (['/TRACK/SUPER_USER'], True),
        (['/track/super_user'], True),
        (['/SUBMIT/EAO_STAFF', '/TRACK/INSTANCE_ADMIN'], True),
        (['/TRACK/NO_ROLE'], False),
        (['/TRACK'], False),
        (['/SUBMIT/EAO_STAFF'], False),
        (['/COMPLIANCE/USER'], False),
        (['/ENGAGE/EAO_TEAM_MEMBER'], False),
        (['/SUBTRACK/VIEWER'], False),
        (['VIEWER'], False),
        ([], False),
    ],
)
def test_a_role_in_an_allowed_app_grants_access(app, groups, expected):
    """A role group under TRACK gets in; NO_ROLE and other apps do not."""
    with app.app_context():
        assert token_utils.has_app_access(idir_claims(groups=groups)) is expected


def test_no_allowed_app_groups_denies_everyone(app, monkeypatch):
    """An empty list fails closed rather than switching the check off."""
    monkeypatch.setitem(app.config, 'ALLOWED_APP_GROUPS', [])
    with app.app_context():
        assert token_utils.has_app_access(idir_claims()) is False


ALLOWLIST = ['epic-centre', 'map-web']


@pytest.mark.parametrize('client', ALLOWLIST)
def test_a_token_from_any_allowed_client_is_accepted(app, client, monkeypatch):
    """Each EPIC application has its own keycloak client; all of them may call."""
    with app.app_context():
        monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWLIST)
        assert token_utils.is_allowed_client(idir_claims(azp=client)) is True


@pytest.mark.parametrize('aud', ['epic-centre', ['epic-submit', 'account', 'epic-centre']])
def test_an_allowed_client_in_aud_alone_is_refused(app, monkeypatch, aud):
    """Keycloak lists in aud every client the user holds a role in, so only azp names the caller."""
    with app.app_context():
        monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWLIST)
        claims = idir_claims(aud=aud, azp='epic-submit')

        assert token_utils.is_allowed_client(claims) is False


def test_a_token_from_an_unlisted_client_is_refused(app, monkeypatch):
    """A client in the shared realm that this API does not serve is not a caller."""
    with app.app_context():
        monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWLIST)
        claims = idir_claims(aud='account', azp='some-other-realm-client')

        assert token_utils.is_allowed_client(claims) is False


def test_an_empty_allowlist_denies_everything(app, monkeypatch):
    """A misconfigured deployment must stop serving, not serve everyone."""
    with app.app_context():
        monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', [])

        assert token_utils.is_allowed_client(idir_claims()) is False


def test_a_token_without_azp_is_refused(app, monkeypatch):
    """No azp means no named caller, whatever aud says."""
    with app.app_context():
        monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ALLOWLIST)

        assert token_utils.is_allowed_client(idir_claims(aud='epic-centre', azp=None)) is False
