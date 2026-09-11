"""Service for the layers a user has applied to the map."""
from typing import Optional

from map_api.exceptions import UnprocessableEntityError
from map_api.models.user_applied_layer import UserAppliedLayer as UserAppliedLayerModel
from map_api.utils.constant import MAX_APPLIED_LAYERS_PER_MAP


class UserAppliedLayerService:
    """Applied layer management."""

    @classmethod
    def list_layers(cls, user_id: int) -> list:
        """Return this user's applied layers, bottom of the stack first."""
        return UserAppliedLayerModel.find_by_user(user_id)

    @classmethod
    def apply_layer(cls, user_id: int, data: dict) -> tuple:
        """Apply a layer to the map. Returns `(layer, created)`.

        The cap lives here so a later caller cannot bypass it. Not race proof,
        which is fine for a guard rail.
        """
        if UserAppliedLayerModel.count_for_user(user_id) >= MAX_APPLIED_LAYERS_PER_MAP:
            raise UnprocessableEntityError(
                f'A map may have at most {MAX_APPLIED_LAYERS_PER_MAP} layers applied.'
            )
        return UserAppliedLayerModel.apply_layer(user_id, data)

    @classmethod
    def update_layer(cls, layer_id: int, user_id: int, data: dict) -> Optional[object]:
        """Return the updated layer, or None if it is not this user's."""
        layer = UserAppliedLayerModel.find_one_for_user(layer_id, user_id)
        if layer is None:
            return None
        return layer.set_opacity(data['opacity'])

    @classmethod
    def remove_layer(cls, layer_id: int, user_id: int) -> Optional[object]:
        """Take a layer off the map, or return None if it is not this user's.

        Deleted outright: the table is the set of applied layers, not a history.
        """
        layer = UserAppliedLayerModel.find_one_for_user(layer_id, user_id)
        if layer is None:
            return None
        layer.delete()
        return layer
