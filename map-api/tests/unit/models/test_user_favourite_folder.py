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
"""Tests for the favourite folder model."""
from map_api.models.user_favourite_folder import UserFavouriteFolder
from map_api.models.user_favourite_layer import UserFavouriteLayer
from map_api.utils.constant import DEFAULT_FOLDER_NAME
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, factory_favourite_folder, factory_favourite_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


def test_the_first_folder_sorts_at_one(app, session):
    """Positions start at 1, so 0 never means a real position."""
    user = factory_user()

    assert UserFavouriteFolder.next_sort_order(user.id) == 1


def test_each_folder_goes_to_the_top_of_the_list(app, session):
    """A new folder is the one being named, so it leads Favourites."""
    user = factory_user()

    first = UserFavouriteFolder.create(user.id, 'Wildfire')
    second = UserFavouriteFolder.create(user.id, 'Roads')

    assert second.sort_order < first.sort_order
    assert [row.id for row in UserFavouriteFolder.find_by_user(user.id)] == [
        second.id, first.id,
    ]


def test_a_new_folder_starts_expanded(app, session):
    """A folder is created open, showing its "Drag layers here" zone."""
    user = factory_user()

    folder = UserFavouriteFolder.create(user.id, DEFAULT_FOLDER_NAME)

    assert folder.is_collapsed is False


def test_two_folders_may_share_a_name(app, session):
    """Every unnamed folder takes the same name, so a name cannot be unique."""
    user = factory_user()

    first = UserFavouriteFolder.create(user.id, DEFAULT_FOLDER_NAME)
    second = UserFavouriteFolder.create(user.id, DEFAULT_FOLDER_NAME)

    assert first.id != second.id
    assert UserFavouriteFolder.count_for_user(user.id) == 2


def test_find_by_user_returns_only_this_users_folders(app, session):
    """Two users' folders do not see each other."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    factory_favourite_folder(owner.id)
    mine = factory_favourite_folder(user.id)

    assert [row.id for row in UserFavouriteFolder.find_by_user(user.id)] == [mine.id]


def test_find_one_for_user_refuses_another_users_folder(app, session):
    """Ownership is part of the lookup, not a check after it."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    theirs = factory_favourite_folder(owner.id)

    assert UserFavouriteFolder.find_one_for_user(theirs.id, user.id) is None
    assert UserFavouriteFolder.find_one_for_user(theirs.id, owner.id) is not None


def test_deleting_a_folder_leaves_its_layers_favourited(app, session):
    """SET NULL is the backstop under the service: a layer outlives its folder."""
    user = factory_user()
    folder = factory_favourite_folder(user.id)
    favourite = factory_favourite_layer(user.id, folder_id=folder.id)

    folder.delete()
    session.refresh(favourite)

    assert UserFavouriteLayer.find_one_for_user(favourite.id, user.id) is not None
    assert favourite.folder_id is None
