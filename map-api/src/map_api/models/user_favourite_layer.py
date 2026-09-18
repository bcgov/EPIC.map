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
"""Favourite map layers: the set a user has favourited for quick access.

Independent of the applied layers: a favourite does not put a layer on the map and
taking a layer off the map does not un-favourite it. The two tables share an identity
triple so the client can match them up.

Folders are in a follow-up Map-34, which adds `user_favourite_folders` and a
nullable `folder_id` here. `sort_order` is per user for now and will be per folder then.
"""
from __future__ import annotations

from sqlalchemy import func

from .base_model import BaseModel
from .catalogue_layer_reference import CatalogueLayerReference
from .db import db


class UserFavouriteLayer(CatalogueLayerReference, BaseModel):
    """Definition of the favourite layer entity."""

    __tablename__ = 'user_favourite_layers'

    __table_args__ = (
        db.UniqueConstraint(
            'user_id', 'source', 'object_name',
            name='uq_user_favourite_layers_identity',
        ),
    )

    @classmethod
    def next_sort_order(cls, user_id: int) -> int:
        """Return the position for the next favourite - the top of the list.

        A favourite is newest first, so it goes below the lowest position rather
        than above the highest.

        Taking min - 1 keeps this one statement and leaves the rows already
        stored untouched.`reorder` renumbers to a dense 1..N whenever the user drags.
        """
        current = (
            db.session.query(func.min(cls.sort_order))
            .filter_by(user_id=user_id)
            .scalar()
        )
        return 1 if current is None else current - 1

    @classmethod
    def add_favourite(cls, user_id: int, data: dict) -> tuple[UserFavouriteLayer, bool]:
        """Favourite the layer, or return the one already favourited.

        Returns `(row, created)`. Favouriting twice is not an error.
        """
        return cls.add_reference(user_id, data)
