"""Service for the folders a user files their favourite layers into."""
from typing import Optional

from map_api.exceptions import UnprocessableEntityError
from map_api.models.user_favourite_folder import UserFavouriteFolder as UserFavouriteFolderModel
from map_api.models.user_favourite_layer import UserFavouriteLayer as UserFavouriteLayerModel
from map_api.utils.constant import DEFAULT_FOLDER_NAME, MAX_FAVOURITE_FOLDERS


def folder_name(value: Optional[str]) -> str:
    """Return the name to store for a folder.

    A name is trimmed, and one that is blank or only whitespace falls back to
    the default rather than being refused: the client commits the name field on
    a blur, so an empty one is the user moving on, not a bad request.
    """
    return (value or '').strip() or DEFAULT_FOLDER_NAME


class UserFavouriteFolderService:
    """Favourite folder management."""

    @classmethod
    def list_folders(cls, user_id: int) -> list:
        """Return this user's folders, in the order they are shown in."""
        return UserFavouriteFolderModel.find_by_user(user_id)

    @classmethod
    def create_folder(cls, user_id: int, data: dict):
        """Add a folder at the top of the user's Favourites.

        The cap lives here so a later caller cannot bypass it.
        """
        if UserFavouriteFolderModel.count_for_user(user_id) >= MAX_FAVOURITE_FOLDERS:
            raise UnprocessableEntityError(
                f'A user may have at most {MAX_FAVOURITE_FOLDERS} favourite folders.'
            )
        return UserFavouriteFolderModel.create(user_id, folder_name(data.get('name')))

    @classmethod
    def update_folder(cls, folder_id: int, user_id: int, data: dict) -> Optional[object]:
        """Rename a folder, collapse it, or both. None if it is not this user's.

        Only the keys the client sent are touched, so collapsing a folder cannot
        rename it by omission.
        """
        folder = UserFavouriteFolderModel.find_one_for_user(folder_id, user_id)
        if folder is None:
            return None

        if 'name' in data:
            folder.name = folder_name(data['name'])
        if 'is_collapsed' in data:
            folder.is_collapsed = data['is_collapsed']
        folder.save()
        return folder

    @classmethod
    def ungroup_folder(cls, folder_id: int, user_id: int) -> Optional[list]:
        """Empty a folder, keeping it. None if it is not this user's.

        The layers move to the top level; nothing is un-favourited. Returns the
        layers that moved, which is empty for a folder that was already empty.
        """
        folder = UserFavouriteFolderModel.find_one_for_user(folder_id, user_id)
        if folder is None:
            return None
        return UserFavouriteLayerModel.empty_folder(user_id, folder_id)

    @classmethod
    def delete_folder(cls, folder_id: int, user_id: int) -> Optional[object]:
        """Delete a folder, or return None if it is not this user's. Hard delete.

        The layers inside are ungrouped first rather than left to the database's
        SET NULL, so they come out at the top level with positions of their own.
        """
        folder = UserFavouriteFolderModel.find_one_for_user(folder_id, user_id)
        if folder is None:
            return None

        UserFavouriteLayerModel.empty_folder(user_id, folder_id)
        folder.delete()
        return folder
