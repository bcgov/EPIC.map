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
"""Tests for the favourite layer service."""
import pytest

from map_api.exceptions import BadRequestError, UnprocessableEntityError
from map_api.models.user_favourite_layer import UserFavouriteLayer
from map_api.services.user_favourite_layer_service import UserFavouriteLayerService
from tests.utilities.factory_utils import (
    SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, bcdc_layer_payload, factory_favourite_layer, factory_user)


OTHER_OBJECT = 'WHSE_FOREST_TENURE.FTEN_RANGE_POLY_SVW'


def test_add_favourite_stores_the_layer(app, session):
    """Starring a layer writes a row the user owns."""
    user = factory_user()

    favourite, created = UserFavouriteLayerService.add_favourite(user.id, bcdc_layer_payload())

    assert created is True
    assert favourite.display_name == 'Indian Reserves'
    assert favourite.source == 'bcdc'


def test_add_favourite_refuses_past_the_cap(app, session, monkeypatch):
    """The cap lives in the service so a later caller cannot bypass it."""
    monkeypatch.setattr(
        'map_api.services.user_favourite_layer_service.MAX_FAVOURITE_LAYERS', 1
    )
    user = factory_user()
    UserFavouriteLayerService.add_favourite(user.id, bcdc_layer_payload())

    with pytest.raises(UnprocessableEntityError):
        UserFavouriteLayerService.add_favourite(
            user.id, bcdc_layer_payload(object_name=OTHER_OBJECT)
        )


def test_restarring_at_the_cap_is_still_allowed(app, session, monkeypatch):
    """The cap counts rows, and a repeat star adds none."""
    monkeypatch.setattr(
        'map_api.services.user_favourite_layer_service.MAX_FAVOURITE_LAYERS', 1
    )
    user = factory_user()
    first, _ = UserFavouriteLayerService.add_favourite(user.id, bcdc_layer_payload())

    with pytest.raises(UnprocessableEntityError):
        UserFavouriteLayerService.add_favourite(user.id, bcdc_layer_payload())

    assert UserFavouriteLayer.count_for_user(user.id) == 1
    assert first.id is not None


def test_remove_favourite_returns_none_for_another_users_row(app, session):
    """The resource turns None into a 204 that gives nothing away."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    favourite = factory_favourite_layer(owner.id)

    assert UserFavouriteLayerService.remove_favourite(favourite.id, user.id) is None
    assert UserFavouriteLayer.find_one_for_user(favourite.id, owner.id) is not None


def test_reorder_favourites_applies_the_new_order(app, session):
    """The list comes back in the order asked for, not the order it was in."""
    user = factory_user()
    first = factory_favourite_layer(user.id)
    second = factory_favourite_layer(user.id, object_name=OTHER_OBJECT)
    # Newest first, so the starting order is the reverse of the starring order.
    assert [row.id for row in UserFavouriteLayerService.list_favourites(user.id)] == [
        second.id, first.id,
    ]

    reordered = UserFavouriteLayerService.reorder_favourites(user.id, [first.id, second.id])

    assert [row.id for row in reordered] == [first.id, second.id]
    assert [row.sort_order for row in reordered] == [1, 2]


def test_reorder_favourites_rejects_a_missing_id(app, session):
    """A partial list would leave the rest at a position nobody chose."""
    user = factory_user()
    first = factory_favourite_layer(user.id)
    factory_favourite_layer(user.id, object_name=OTHER_OBJECT)

    with pytest.raises(BadRequestError):
        UserFavouriteLayerService.reorder_favourites(user.id, [first.id])


def test_reorder_favourites_rejects_a_duplicate_id(app, session):
    """One favourite cannot hold two positions."""
    user = factory_user()
    first = factory_favourite_layer(user.id)
    factory_favourite_layer(user.id, object_name=OTHER_OBJECT)

    with pytest.raises(BadRequestError):
        UserFavouriteLayerService.reorder_favourites(user.id, [first.id, first.id])


def test_reorder_favourites_rejects_an_unknown_id(app, session):
    """An id that is not a favourite means the client list is stale."""
    user = factory_user()
    first = factory_favourite_layer(user.id)

    with pytest.raises(BadRequestError):
        UserFavouriteLayerService.reorder_favourites(user.id, [first.id, 999999])


def test_reorder_favourites_rejects_another_users_id(app, session):
    """Refused the same way as an unknown id, so nothing is confirmed."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    theirs = factory_favourite_layer(owner.id)
    factory_favourite_layer(user.id)

    with pytest.raises(BadRequestError):
        UserFavouriteLayerService.reorder_favourites(user.id, [theirs.id])
