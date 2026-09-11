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
"""Tests for resolving the signed-in user."""
import pytest
from flask import g
from werkzeug.exceptions import Unauthorized

from map_api.models.user import User
from map_api.services.user_service import UserService
from tests.utilities.factory_utils import SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, factory_user, idir_claims


def test_current_user_returns_the_existing_row(app, session):
    """A user who has signed in before is looked up, not recreated."""
    existing = factory_user()
    g.token_info = idir_claims()

    assert UserService.current_user().id == existing.id


def test_current_user_provisions_a_row_on_first_use(app, session):
    """A user who never called /users/me still gets a profile."""
    g.token_info = idir_claims()

    user = UserService.current_user()

    assert user.id is not None
    assert user.auth_guid == idir_claims()['preferred_username']


def test_current_user_does_not_provision_twice(app, session):
    """The second call finds the row the first one created."""
    g.token_info = idir_claims()

    first = UserService.current_user()
    second = UserService.current_user()

    assert first.id == second.id


def test_current_user_follows_the_token_it_is_given(app, session):
    """Identity is never cached across calls.

    Guards against memoising on `g`, which would serve one user another's row.
    """
    factory_user()
    factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    g.token_info = idir_claims()
    first = UserService.current_user()

    g.token_info = idir_claims(
        preferred_username=SECOND_AUTH_GUID, idir_username=SECOND_IDIR_USERNAME
    )
    second = UserService.current_user()

    assert first.id != second.id
    assert second.auth_guid == SECOND_AUTH_GUID


def test_current_user_without_a_token_is_unauthorized(app, session):
    """Fails closed if a resource is ever wired up without the auth hook."""
    if hasattr(g, 'token_info'):
        del g.token_info

    with pytest.raises(Unauthorized):
        UserService.current_user()


def test_current_user_does_not_write_when_the_row_exists(app, session):
    """A plain read must not bump last_login_at on every request."""
    existing = factory_user()
    original_login = existing.last_login_at
    g.token_info = idir_claims()

    UserService.current_user()

    session.refresh(existing)
    assert existing.last_login_at == original_login


def test_sync_user_from_token_creates_a_profile(app, session):
    """The upsert path /users/me uses still works."""
    user = UserService.sync_user_from_token(idir_claims())

    assert User.find_by_auth_guid(idir_claims()['preferred_username']).id == user.id
    assert user.last_login_at is not None
