"""Service for the layers a user has starred as favourites."""
from typing import Optional

from map_api.exceptions import BadRequestError, UnprocessableEntityError
from map_api.models.user_favourite_folder import UserFavouriteFolder as UserFavouriteFolderModel
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
    def move_favourite(cls, favourite_id: int, user_id: int, folder_id: Optional[int]) -> Optional[object]:
        """File a favourite into a folder, or back out to the top level.

        None if the favourite is not this user's. An unknown folder is refused
        the same way as another user's, so the error does not confirm it exists.
        """
        cls._own_folder(user_id, folder_id)

        favourite = UserFavouriteLayerModel.find_one_for_user(favourite_id, user_id)
        if favourite is None:
            return None
        return UserFavouriteLayerModel.move_to_folder(favourite, folder_id)

    @classmethod
    def reorder_favourites(cls, user_id: int, favourite_ids: list,
                           folder_id: Optional[int] = None) -> list:
        """Put one container's favourites in the order given, and return them.

        The ids must be exactly the favourites in that container - a folder of
        this user's, or the top level. An id from another container is refused
        the same way as another user's, so a reorder cannot quietly move a layer
        between folders; that is a move.
        """
        cls._own_folder(user_id, folder_id)

        current_ids = UserFavouriteLayerModel.find_ids_in_folder(user_id, folder_id)
        if sorted(favourite_ids) != sorted(current_ids):
            raise BadRequestError(
                'favourite_ids must list every favourite in this folder, exactly once.'
            )
        return UserFavouriteLayerModel.reorder_in_folder(user_id, favourite_ids, folder_id)

    @staticmethod
    def _own_folder(user_id: int, folder_id: Optional[int]) -> None:
        """Refuse a folder that is not this user's. None is the top level."""
        if folder_id is None:
            return
        if UserFavouriteFolderModel.find_one_for_user(folder_id, user_id) is None:
            raise BadRequestError(f'Folder {folder_id} not found.')
