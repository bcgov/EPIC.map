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
        (['/EPIC/MAP/user'], True),
        (['MAP'], True),
        (['/EPIC/map/admin'], True),
        (['/EPIC/COMPLIANCE/user'], False),
        ([], False),
    ],
)
def test_group_membership_decides_access_when_a_group_is_required(
    app, groups, expected
):
    """With AUTH_REQUIRED_GROUP set, a token is only good here if it names it."""
    with app.app_context():
        app.config['AUTH_REQUIRED_GROUP'] = 'MAP'
        assert token_utils.belongs_to_app(idir_claims(groups=groups)) is expected


@pytest.mark.parametrize('groups', [[], ['/EPIC/COMPLIANCE/user']])
def test_groups_are_not_consulted_when_no_group_is_required(app, groups):
    """Unset AUTH_REQUIRED_GROUP means the gate is off, not that it denies all."""
    with app.app_context():
        app.config['AUTH_REQUIRED_GROUP'] = ''
        assert token_utils.belongs_to_app(idir_claims(groups=groups)) is True


ALLOWLIST = ['compliance-web', 'submit-web', 'track-web', 'map-web']


@pytest.mark.parametrize('client', ALLOWLIST)
def test_a_token_from_any_allowed_client_is_accepted(app, client):
    """Each EPIC application has its own keycloak client; all of them may call."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = ALLOWLIST
        assert token_utils.is_allowed_client(idir_claims(azp=client)) is True


def test_the_audience_claim_is_accepted_as_well_as_azp(app):
    """A deployment that puts the client in aud rather than azp still works."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = ALLOWLIST
        claims = idir_claims(aud='track-web', azp='something-else')

        assert token_utils.is_allowed_client(claims) is True


def test_an_audience_list_is_searched_not_compared(app):
    """`aud` may be a list; any entry on the allowlist is enough."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = ALLOWLIST
        claims = idir_claims(aud=['account', 'submit-web'], azp='unlisted')

        assert token_utils.is_allowed_client(claims) is True


def test_a_token_from_an_unlisted_client_is_refused(app):
    """A client in the shared realm that this API does not serve is not a caller."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = ALLOWLIST
        claims = idir_claims(aud='account', azp='some-other-realm-client')

        assert token_utils.is_allowed_client(claims) is False


def test_an_empty_allowlist_denies_everything(app):
    """A misconfigured deployment must stop serving, not serve everyone."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = []

        assert token_utils.is_allowed_client(idir_claims()) is False


def test_a_single_entry_allowlist_behaves_like_one_audience(app):
    """The shape this collapses to once a dedicated api scope exists."""
    with app.app_context():
        app.config['ALLOWED_CLIENT_IDS'] = ['epic-map-api']

        assert token_utils.is_allowed_client(idir_claims(aud='epic-map-api')) is True
        assert token_utils.is_allowed_client(idir_claims(azp='map-web')) is False
