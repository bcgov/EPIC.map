"""Service for the layers a user has starred as favourites."""
from typing import Optional

from map_api.exceptions import BadRequestError, UnprocessableEntityError
from map_api.models.user_favourite_folder import UserFavouriteFolder as UserFavouriteFolderModel
from map_api.models.user_favourite_layer import UserFavouriteLayer as UserFavouriteLayerModel
from map_api.services.local_layer_service import LOCAL_LAYERS
from map_api.utils.constant import MAX_FAVOURITE_LAYERS

# Hosted layers every user gets a favourite of, and the name it is listed under.
#
# These are not starred, they are given: the layer has no catalogue record, so
# there is no search result to star it from, and it is one EAO staff are meant
# to have to hand rather than one they opt into. The display name is here rather
# than read from the layer because it is what a reader of the panel should see,
# which is not the warehouse's title for the table.
# EAO.PROJECT_DATA is deliberately absent: the project footprints are drawn
# from the filter bar rather than switched on from the panel, so they have no
# row to star, unstar, file or toggle.
SEEDED_LOCAL_FAVOURITES = {
    'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP':
        'Profiles of Indigenous People (PIP) - First Nation Consultation Areas',
}

# A seed for a layer nothing serves would put a row in every user's panel that
# draws nothing and answers no click, so it fails at import instead.
for _object_name in SEEDED_LOCAL_FAVOURITES:
    assert _object_name in LOCAL_LAYERS, (
        f'{_object_name} is seeded as a favourite but is not a hosted layer.'
    )


class UserFavouriteLayerService:
    """Favourite layer management."""

    @classmethod
    def list_favourites(cls, user_id: int) -> list:
        """Return this user's favourites, in the order they chose.

        The hosted layers are seeded here rather than when the user is
        provisioned: this is the one call every client makes before showing the
        panel, so a layer added to the set later reaches users who already exist.
        """
        for object_name, display_name in SEEDED_LOCAL_FAVOURITES.items():
            UserFavouriteLayerModel.ensure_local(user_id, object_name, display_name)
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
        """Unstar a layer, or return None if it is not this user's. Hard delete.

        A seeded favourite is refused: the next GET would put it straight back,
        so deleting it is not something that can be made to hold.
        """
        favourite = UserFavouriteLayerModel.find_one_for_user(favourite_id, user_id)
        if favourite is None:
            return None
        if favourite.restricted:
            raise BadRequestError(
                f'{favourite.display_name} cannot be removed from favourites.'
            )
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
