"""Service for the layers a user has starred as favourites."""
from typing import Optional

from map_api.exceptions import BadRequestError, UnprocessableEntityError
from map_api.models.user_favourite_layer import UserFavouriteLayer as UserFavouriteLayerModel
from map_api.utils.constant import MAX_FAVOURITE_LAYERS


class UserFavouriteLayerService:
    """Favourite layer management."""

    @classmethod
    def list_favourites(cls, user_id: int) -> list:
        """Return this user's favourites, in the order they chose."""
        return UserFavouriteLayerModel.find_by_user(user_id)

    @classmethod
    def add_favourite(cls, user_id: int, data: dict) -> tuple:
        """Star a layer. Returns `(favourite, created)`.

        The cap lives here so a later caller cannot bypass it.
        """
        if UserFavouriteLayerModel.count_for_user(user_id) >= MAX_FAVOURITE_LAYERS:
            raise UnprocessableEntityError(
                f'A user may have at most {MAX_FAVOURITE_LAYERS} favourite layers.'
            )
        return UserFavouriteLayerModel.add_favourite(user_id, data)

    @classmethod
    def remove_favourite(cls, favourite_id: int, user_id: int) -> Optional[object]:
        """Unstar a layer, or return None if it is not this user's. Hard delete."""
        favourite = UserFavouriteLayerModel.find_one_for_user(favourite_id, user_id)
        if favourite is None:
            return None
        favourite.delete()
        return favourite

    @classmethod
    def reorder_favourites(cls, user_id: int, favourite_ids: list) -> list:
        """Put the user's favourites in the order given, and return them.

        The ids must be exactly this user's favourites. Another user's id is refused the
        same way as an unknown one, so the error does not confirm the row exists.
        """
        current_ids = UserFavouriteLayerModel.find_ids_for_user(user_id)
        if sorted(favourite_ids) != sorted(current_ids):
            raise BadRequestError(
                'favourite_ids must list every favourite this user has, exactly once.'
            )
        return UserFavouriteLayerModel.reorder(user_id, favourite_ids)
