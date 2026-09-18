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

A favourite sits in exactly one container: a folder, or the top level when
`folder_id` is null. `sort_order` is a position within that container, so the
same numbers repeat across folders and only ever compare inside one.
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

    # Which folder the layer is filed in, or null for the top level. SET NULL
    # rather than CASCADE: losing a folder must never un-favourite a layer.
    folder_id = db.Column(
        db.Integer,
        db.ForeignKey('user_favourite_folders.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )

    @classmethod
    def find_in_folder(cls, user_id: int, folder_id: int = None) -> list:
        """Return one container's favourites, lowest position first.

        `folder_id` None is the top level, not "any folder": filter_by reads a
        None as IS NULL.
        """
        return (
            cls.query
            .filter_by(user_id=user_id, folder_id=folder_id)
            .order_by(cls.sort_order.asc(), cls.id.asc())
            .all()
        )

    @classmethod
    def find_ids_in_folder(cls, user_id: int, folder_id: int = None) -> list[int]:
        """Return the ids in one container, in list order."""
        return [row.id for row in cls.find_in_folder(user_id, folder_id)]

    @classmethod
    def top_sort_order(cls, user_id: int, folder_id: int = None) -> int:
        """Return the position above everything already in the container.

        A favourite is newest first, so it goes below the lowest position rather
        than above the highest.

        Taking min - 1 keeps this one statement and leaves the rows already
        stored untouched. `reorder_in_folder` renumbers to a dense 1..N whenever
        the user drags.
        """
        current = (
            db.session.query(func.min(cls.sort_order))
            .filter_by(user_id=user_id, folder_id=folder_id)
            .scalar()
        )
        return 1 if current is None else current - 1

    @classmethod
    def bottom_sort_order(cls, user_id: int, folder_id: int = None) -> int:
        """Return the position below everything already in the container."""
        current = (
            db.session.query(func.max(cls.sort_order))
            .filter_by(user_id=user_id, folder_id=folder_id)
            .scalar()
        )
        return 1 if current is None else current + 1

    @classmethod
    def next_sort_order(cls, user_id: int) -> int:
        """Return the position for the next favourite - the top of the top level.

        A newly starred layer is never in a folder, so the container is fixed.
        """
        return cls.top_sort_order(user_id)

    @classmethod
    def add_favourite(cls, user_id: int, data: dict) -> tuple[UserFavouriteLayer, bool]:
        """Favourite the layer, or return the one already favourited.

        Returns `(row, created)`. Favouriting twice is not an error.
        """
        return cls.add_reference(user_id, data)

    @classmethod
    def move_to_folder(cls, favourite: UserFavouriteLayer, folder_id: int = None) -> UserFavouriteLayer:
        """File the favourite into a folder, or back out to the top level.

        A move, not an add: setting the new container is what takes the layer
        out of the old one, so it can only ever be in one. It lands at the top
        of the container it arrives in, where a new favourite goes.
        """
        # Read the position before assigning the folder: setting it first lets
        # autoflush put the row in the target container, and the layer is then
        # measured against itself.
        sort_order = cls.top_sort_order(favourite.user_id, folder_id)
        favourite.folder_id = folder_id
        favourite.sort_order = sort_order
        favourite.save()
        return favourite

    @classmethod
    def empty_folder(cls, user_id: int, folder_id: int) -> list:
        """Move every layer out of the folder to the top level, and return them.

        Nothing is un-favourited. The layers keep their order relative to each
        other and land below what is already at the top level, so ungrouping
        never reshuffles the list the user was looking at.
        """
        rows = cls.find_in_folder(user_id, folder_id)
        if not rows:
            return []

        position = cls.bottom_sort_order(user_id)
        for row in rows:
            row.folder_id = None
            row.sort_order = position
            position += 1
        db.session.commit()
        return rows

    @classmethod
    def reorder_in_folder(cls, user_id: int, row_ids: list[int], folder_id: int = None) -> list:
        """Renumber one container's favourites to match the order given.

        The caller has already checked that the ids are exactly the container's
        rows. Positions are rewritten as 1..N in one transaction.
        """
        rows = {row.id: row for row in cls.find_in_folder(user_id, folder_id)}
        for position, row_id in enumerate(row_ids, start=1):
            rows[row_id].sort_order = position
        db.session.commit()
        return cls.find_in_folder(user_id, folder_id)
