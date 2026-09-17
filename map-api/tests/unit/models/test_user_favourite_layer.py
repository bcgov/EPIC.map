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
"""Tests for the favourite layer model."""
from map_api.models.user_favourite_layer import UserFavouriteLayer
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_favourite_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'
THIRD_OBJECT = 'WHSE_BASEMAPPING.GBA_RAILWAY_TRACKS_SP'


def test_the_first_favourite_sorts_at_one(app, session):
    """Positions start at 1, so 0 never means a real position."""
    user = factory_user()

    assert UserFavouriteLayer.next_sort_order(user.id) == 1


def test_each_favourite_goes_to_the_top_of_the_list(app, session):
    """A newly starred layer is the one the user just chose, so it leads."""
    user = factory_user()

    first, _ = UserFavouriteLayer.add_favourite(user.id, bcdc_layer_payload())
    second, _ = UserFavouriteLayer.add_favourite(
        user.id, bcdc_layer_payload(object_name=OTHER_OBJECT)
    )

    assert second.sort_order < first.sort_order
    assert [row.id for row in UserFavouriteLayer.find_by_user(user.id)] == [
        second.id, first.id,
    ]


def test_positions_below_zero_still_order_correctly(app, session):
    """A position is an ordering token, not a rank, so negatives are fine."""
    user = factory_user()
    ordered = []
    for object_name in (None, OTHER_OBJECT, THIRD_OBJECT):
        payload = bcdc_layer_payload() if object_name is None else bcdc_layer_payload(
            object_name=object_name
        )
        row, _ = UserFavouriteLayer.add_favourite(user.id, payload)
        ordered.insert(0, row.id)

    assert [row.id for row in UserFavouriteLayer.find_by_user(user.id)] == ordered


def test_starring_the_same_layer_twice_returns_the_existing_row(app, session):
    """The unique constraint decides, so two tabs cannot both insert."""
    user = factory_user()
    first, created_first = UserFavouriteLayer.add_favourite(user.id, bcdc_layer_payload())

    second, created_second = UserFavouriteLayer.add_favourite(user.id, bcdc_layer_payload())

    assert (created_first, created_second) == (True, False)
    assert second.id == first.id
    assert UserFavouriteLayer.count_for_user(user.id) == 1


def test_two_users_may_favourite_the_same_layer(app, session):
    """The unique key is per user, not per layer."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)

    _, created_first = UserFavouriteLayer.add_favourite(user.id, bcdc_layer_payload())
    _, created_second = UserFavouriteLayer.add_favourite(other.id, bcdc_layer_payload())

    assert (created_first, created_second) == (True, True)


def test_find_by_user_breaks_ties_on_id(app, session):
    """Rows written with the same position still come back in a fixed order."""
    user = factory_user()
    first = factory_favourite_layer(user.id, sort_order=0)
    second = factory_favourite_layer(user.id, object_name=OTHER_OBJECT, sort_order=0)

    assert [row.id for row in UserFavouriteLayer.find_by_user(user.id)] == [
        first.id, second.id,
    ]


def test_find_one_for_user_refuses_another_users_row(app, session):
    """Ownership is a filter, so the caller cannot reach across."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    favourite = factory_favourite_layer(owner.id)

    assert UserFavouriteLayer.find_one_for_user(favourite.id, user.id) is None


def test_reorder_renumbers_the_list_from_one(app, session):
    """Positions are rewritten as 1..N, so no gaps accumulate."""
    user = factory_user()
    first = factory_favourite_layer(user.id)
    second = factory_favourite_layer(user.id, object_name=OTHER_OBJECT)
    third = factory_favourite_layer(user.id, object_name=THIRD_OBJECT)

    reordered = UserFavouriteLayer.reorder(user.id, [third.id, first.id, second.id])

    assert [row.id for row in reordered] == [third.id, first.id, second.id]
    assert [row.sort_order for row in reordered] == [1, 2, 3]


def test_reorder_leaves_another_users_list_alone(app, session):
    """Renumbering is scoped to the user whose drag it was."""
    user = factory_user()
    other = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    theirs = factory_favourite_layer(other.id, sort_order=7)
    first = factory_favourite_layer(user.id)
    second = factory_favourite_layer(user.id, object_name=OTHER_OBJECT)

    UserFavouriteLayer.reorder(user.id, [second.id, first.id])

    session.refresh(theirs)
    assert theirs.sort_order == 7
