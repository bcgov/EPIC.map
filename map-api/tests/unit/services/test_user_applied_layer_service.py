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
"""Tests for the applied layer service."""
import pytest

from map_api.exceptions import UnprocessableEntityError
from map_api.models.user_applied_layer import UserAppliedLayer
from map_api.services.user_applied_layer_service import UserAppliedLayerService
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_applied_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


def test_list_layers_returns_only_this_users_rows(app, session):
    """One user's map is not visible from another's."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    factory_applied_layer(user.id)

    assert len(UserAppliedLayerService.list_layers(user.id)) == 1
    assert UserAppliedLayerService.list_layers(other.id) == []


def test_apply_layer_assigns_the_next_sort_order(app, session):
    """The most recently applied layer draws on top."""
    user = factory_user()

    first, _ = UserAppliedLayerService.apply_layer(user.id, bcdc_layer_payload())
    second, _ = UserAppliedLayerService.apply_layer(
        user.id, bcdc_layer_payload(object_name=OTHER_OBJECT)
    )

    assert second.sort_order > first.sort_order


def test_apply_layer_is_idempotent(app, session):
    """Applying an already applied layer returns it rather than failing."""
    user = factory_user()
    first, created_first = UserAppliedLayerService.apply_layer(user.id, bcdc_layer_payload())
    second, created_second = UserAppliedLayerService.apply_layer(user.id, bcdc_layer_payload())

    assert created_first is True
    assert created_second is False
    assert second.id == first.id


def test_apply_layer_refuses_past_the_cap(app, session, monkeypatch):
    """A guard rail against a client applying layers without bound."""
    monkeypatch.setattr(
        'map_api.services.user_applied_layer_service.MAX_APPLIED_LAYERS_PER_MAP', 1
    )
    user = factory_user()
    UserAppliedLayerService.apply_layer(user.id, bcdc_layer_payload())

    with pytest.raises(UnprocessableEntityError):
        UserAppliedLayerService.apply_layer(
            user.id, bcdc_layer_payload(object_name=OTHER_OBJECT)
        )


def test_update_layer_changes_the_opacity(app, session):
    """The slider's value is what gets stored."""
    user = factory_user()
    layer = factory_applied_layer(user.id)

    updated = UserAppliedLayerService.update_layer(
        layer.id, user.id, {'opacity': 35}
    )

    assert updated.opacity == 35


def test_update_layer_returns_none_for_another_users_row(app, session):
    """Ownership is enforced in the query, so this never loads the row."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    layer = factory_applied_layer(user.id)

    result = UserAppliedLayerService.update_layer(
        layer.id, other.id, {'opacity': 10}
    )

    assert result is None
    session.refresh(layer)
    assert layer.opacity == 100


def test_remove_layer_hard_deletes_the_row(app, session):
    """The set of rows is the set of applied layers, not a history."""
    user = factory_user()
    layer = factory_applied_layer(user.id)

    UserAppliedLayerService.remove_layer(layer.id, user.id)

    assert UserAppliedLayer.find_one_for_user(layer.id, user.id) is None


def test_remove_layer_returns_none_for_another_users_row(app, session):
    """A stranger cannot take a layer off somebody else's map."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    layer = factory_applied_layer(user.id)

    assert UserAppliedLayerService.remove_layer(layer.id, other.id) is None
    assert UserAppliedLayer.find_one_for_user(layer.id, user.id) is not None
