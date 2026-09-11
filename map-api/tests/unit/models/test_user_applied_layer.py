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
"""Tests for the applied layer model."""
import pytest
from sqlalchemy.exc import IntegrityError

from map_api.models.user import User
from map_api.models.user_applied_layer import UserAppliedLayer
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_applied_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


def test_next_sort_order_starts_at_one_on_an_empty_map(app, session):
    """The first layer applied sits at the bottom of the stack."""
    user = factory_user()
    assert UserAppliedLayer.next_sort_order(user.id) == 1


def test_next_sort_order_is_max_plus_one(app, session):
    """Each layer applied goes on top of the one before."""
    user = factory_user()
    factory_applied_layer(user.id)
    factory_applied_layer(user.id, object_name=OTHER_OBJECT)

    assert UserAppliedLayer.next_sort_order(user.id) == 3


def test_the_same_layer_twice_is_rejected(app, session):
    """A layer is on the map or it is not; it cannot be on it twice."""
    user = factory_user()
    factory_applied_layer(user.id)

    with pytest.raises(IntegrityError):
        factory_applied_layer(user.id)


def test_a_different_layer_is_allowed(app, session):
    """Uniqueness is per layer, not per user."""
    user = factory_user()
    first = factory_applied_layer(user.id)
    second = factory_applied_layer(user.id, object_name=OTHER_OBJECT)

    assert first.id != second.id


def test_two_users_may_apply_the_same_layer(app, session):
    """One user's map does not constrain another's."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    first = factory_applied_layer(user.id)
    second = factory_applied_layer(other.id)

    assert first.id != second.id


def test_opacity_defaults_to_fully_opaque(app, session):
    """A layer applied without an opacity is drawn solid."""
    user = factory_user()
    layer = factory_applied_layer(user.id)

    assert layer.opacity == 100


@pytest.mark.parametrize('opacity', [-1, 101, 1000])
def test_opacity_outside_the_range_is_rejected_by_the_database(app, session, opacity):
    """The CHECK constraint holds even if the schema is bypassed."""
    user = factory_user()

    with pytest.raises(IntegrityError):
        factory_applied_layer(user.id, opacity=opacity)


def test_find_one_for_user_does_not_return_another_users_row(app, session):
    """Ownership is a filter, not a check the caller has to remember."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    layer = factory_applied_layer(user.id)

    assert UserAppliedLayer.find_one_for_user(layer.id, other.id) is None
    assert UserAppliedLayer.find_one_for_user(layer.id, user.id) is not None


def test_deleting_a_user_removes_their_applied_layers(app, session):
    """ON DELETE CASCADE - UserService.delete_user hard deletes the user."""
    user = factory_user()
    factory_applied_layer(user.id)
    user_id = user.id

    user.delete()

    assert UserAppliedLayer.count_for_user(user_id) == 0


def test_find_by_user_returns_the_stack_bottom_first(app, session):
    """Layers come back in draw order, most recently applied last."""
    user = factory_user()
    first = factory_applied_layer(user.id)
    second = factory_applied_layer(user.id, object_name=OTHER_OBJECT)

    layers = UserAppliedLayer.find_by_user(user.id)

    assert [layer.id for layer in layers] == [first.id, second.id]


def test_find_by_user_breaks_a_sort_order_tie_on_id(app, session):
    """Two simultaneous applies can tie; insertion order settles it."""
    user = factory_user()
    first = factory_applied_layer(user.id, sort_order=1)
    second = factory_applied_layer(user.id, object_name=OTHER_OBJECT, sort_order=1)

    layers = UserAppliedLayer.find_by_user(user.id)

    assert [layer.id for layer in layers] == [first.id, second.id]


def test_apply_layer_reports_created_on_the_first_apply(app, session):
    """A layer new to the map is inserted."""
    user = factory_user()

    layer, created = UserAppliedLayer.apply_layer(user.id, bcdc_layer_payload())

    assert created is True
    assert layer.sort_order == 1


def test_apply_layer_returns_the_existing_row_when_already_applied(app, session):
    """Re-applying is not an error, and changes nothing."""
    user = factory_user()
    first, _ = UserAppliedLayer.apply_layer(user.id, bcdc_layer_payload())
    first.set_opacity(40)

    second, created = UserAppliedLayer.apply_layer(user.id, bcdc_layer_payload())

    assert created is False
    assert second.id == first.id
    # The opacity and stacking position the user chose survive a stray re-apply.
    assert second.opacity == 40
    assert second.sort_order == first.sort_order


def test_a_duplicate_apply_leaves_earlier_work_intact(app, session):
    """A duplicate must not roll back the rest of the request.

    Stands in for the staff_users row current_user() may have just provisioned.
    """
    user = factory_user()
    UserAppliedLayer.apply_layer(user.id, bcdc_layer_payload())

    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    other_id = other.id

    _, created = UserAppliedLayer.apply_layer(user.id, bcdc_layer_payload())

    assert created is False
    assert User.find_by_id(other_id) is not None
