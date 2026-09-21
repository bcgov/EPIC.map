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
"""Tests for the favourite folder service."""
import pytest

from map_api.exceptions import UnprocessableEntityError
from map_api.models.user_favourite_folder import UserFavouriteFolder
from map_api.models.user_favourite_layer import UserFavouriteLayer
from map_api.services.user_favourite_folder_service import UserFavouriteFolderService, folder_name
from map_api.utils.constant import DEFAULT_FOLDER_NAME
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, factory_favourite_folder, factory_favourite_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


@pytest.mark.parametrize('given', [None, '', '   ', '\t\n'])
def test_a_name_that_says_nothing_falls_back(given):
    """An empty field is the user moving on, not a bad request."""
    assert folder_name(given) == DEFAULT_FOLDER_NAME


@pytest.mark.parametrize(
    'given, expected', [('Wildfire', 'Wildfire'), ('  Wildfire  ', 'Wildfire')]
)
def test_a_name_is_stored_trimmed(given, expected):
    """Stray whitespace around a name is not part of it."""
    assert folder_name(given) == expected


def test_create_folder_stores_a_folder(app, session):
    """Creating a folder writes a row the user owns."""
    user = factory_user()

    folder = UserFavouriteFolderService.create_folder(user.id, {'name': 'Wildfire'})

    assert folder.name == 'Wildfire'
    assert folder.is_collapsed is False


def test_create_folder_refuses_past_the_cap(app, session, monkeypatch):
    """The cap lives in the service so a later caller cannot bypass it."""
    monkeypatch.setattr(
        'map_api.services.user_favourite_folder_service.MAX_FAVOURITE_FOLDERS', 1
    )
    user = factory_user()
    UserFavouriteFolderService.create_folder(user.id, {})

    with pytest.raises(UnprocessableEntityError):
        UserFavouriteFolderService.create_folder(user.id, {})


def test_update_folder_touches_only_what_was_sent(app, session):
    """Collapsing a folder must not rename it by omission."""
    user = factory_user()
    folder = factory_favourite_folder(user.id, name='Wildfire')

    updated = UserFavouriteFolderService.update_folder(
        folder.id, user.id, {'is_collapsed': True}
    )

    assert updated.name == 'Wildfire'
    assert updated.is_collapsed is True


def test_update_folder_refuses_another_users_folder(app, session):
    """None rather than an exception: the resource decides what to say."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    theirs = factory_favourite_folder(owner.id, name='Theirs')

    assert UserFavouriteFolderService.update_folder(theirs.id, user.id, {'name': 'Mine'}) is None
    assert theirs.name == 'Theirs'


def test_delete_folder_ungroups_before_removing(app, session):
    """The layers come out with positions of their own, not just a null column."""
    user = factory_user()
    folder = factory_favourite_folder(user.id)
    first = factory_favourite_layer(user.id, folder_id=folder.id, sort_order=1)
    second = factory_favourite_layer(user.id, object_name=OTHER_OBJECT, folder_id=folder.id, sort_order=2)

    UserFavouriteFolderService.delete_folder(folder.id, user.id)

    assert UserFavouriteFolder.find_one_for_user(folder.id, user.id) is None
    assert UserFavouriteLayer.find_ids_in_folder(user.id) == [first.id, second.id]
    assert [row.sort_order for row in UserFavouriteLayer.find_in_folder(user.id)] == [1, 2]


def test_delete_folder_refuses_another_users_folder(app, session):
    """None, so the resource can answer the same way as for an unknown id."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    theirs = factory_favourite_folder(owner.id)

    assert UserFavouriteFolderService.delete_folder(theirs.id, user.id) is None
    assert UserFavouriteFolder.find_one_for_user(theirs.id, owner.id) is not None
