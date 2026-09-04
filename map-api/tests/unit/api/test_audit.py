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
"""Tests for the audit log, and for where host_app comes from."""
from http import HTTPStatus

import pytest

from map_api.models.audit_event import AuditEvent
from map_api.models.base_model import BaseModel
from map_api.utils import token as token_utils

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
    """Stub the local profile upsert so the gate can be tested without seeding."""
    monkeypatch.setattr(
        'map_api.resources.user.UserService.sync_user_from_token',
        lambda token_info: _StubUser(),
    )


# --- the claim it is derived from ------------------------------------------

@pytest.mark.parametrize(
    'claims,expected',
    [
        ({'azp': 'compliance-web'}, 'compliance-web'),
        ({'azp': 'map-web'}, 'map-web'),
        ({}, 'unknown'),
        ({'azp': None}, 'unknown'),
        (None, 'unknown'),
    ],
)
def test_host_app_comes_from_azp(claims, expected):
    """The azp claim is signed by keycloak; nothing else names the caller."""
    assert token_utils.host_app(claims) == expected


def test_host_app_ignores_the_audience(app):
    """The aud claim is shared across clients, so it cannot name the caller."""
    with app.app_context():
        claims = idir_claims(aud='account', azp='submit-web')

        assert token_utils.host_app(claims) == 'submit-web'


# --- append only ------------------------------------------------------------

def test_audit_event_is_not_a_base_model():
    """Inheriting BaseModel would add save/delete; audit rows must not have them."""
    assert not issubclass(AuditEvent, BaseModel)


@pytest.mark.parametrize('forbidden', ['save', 'delete', 'update', 'flush', 'add_to_session'])
def test_audit_event_has_no_mutation_methods(forbidden):
    """The model offers no way to change a row after it is written."""
    assert not hasattr(AuditEvent, forbidden)


@pytest.mark.parametrize('column', ['updated_date', 'updated_by'])
def test_audit_event_has_no_updated_columns(column):
    """There is no such thing as a modified audit row."""
    assert column not in AuditEvent.__table__.columns


# --- what actually gets written ---------------------------------------------

@pytest.mark.parametrize(
    'host_app',
    ['compliance-web', 'submit-web', 'track-web', 'map-web'],
)
def test_an_audited_call_records_the_calling_application(
    app, client, jwt, session, stub_user_sync, host_app
):  # pylint: disable=unused-argument,too-many-arguments
    """The row names the client from the token, for each EPIC application."""
    before = session.query(AuditEvent).count()

    response = client.get(ENDPOINT, headers=factory_auth_header(jwt, azp=host_app))

    assert response.status_code == HTTPStatus.OK
    rows = session.query(AuditEvent).order_by(AuditEvent.id).all()
    assert len(rows) == before + 1
    assert rows[-1].host_app == host_app
    assert rows[-1].path == ENDPOINT
    assert rows[-1].status_code == HTTPStatus.OK


def test_host_app_is_never_null(app, client, jwt, session, stub_user_sync):
    """A null would mean a bug in the writer, so the column does not allow one."""
    client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert session.query(AuditEvent).filter(AuditEvent.host_app.is_(None)).count() == 0
    assert AuditEvent.__table__.columns['host_app'].nullable is False


def test_an_unverified_caller_is_not_audited(app, client, jwt, session, monkeypatch):
    """A rejected token has no trustworthy azp, so nothing is recorded from it.

    Auditing here would mean writing an application name out of a token the API
    just refused to believe.
    """
    monkeypatch.setitem(app.config, 'ALLOWED_CLIENT_IDS', ['map-web'])
    before = session.query(AuditEvent).count()

    response = client.get(ENDPOINT, headers=factory_auth_header(jwt, azp='not-listed'))

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert session.query(AuditEvent).count() == before


def test_ops_probes_are_not_audited(client, session):
    """Health probes carry no token and are not application activity."""
    before = session.query(AuditEvent).count()

    client.get('/ops/healthz')

    assert session.query(AuditEvent).count() == before
