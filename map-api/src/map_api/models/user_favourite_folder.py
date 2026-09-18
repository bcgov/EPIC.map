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
"""Folders a user files their favourite layers into.

A folder is a container and nothing else: it holds no catalogue identity and no
render state, so it is not a `CatalogueLayerReference`. Membership lives on
`user_favourite_layers.folder_id`, which keeps a layer in exactly one folder at
a time and lets a folder be emptied without touching what is starred.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.sql import expression

from map_api.utils.constant import DEFAULT_FOLDER_NAME, MAX_FOLDER_NAME_LENGTH

from .base_model import BaseModel
from .db import db


class UserFavouriteFolder(BaseModel):
    """Definition of the favourite folder entity."""

    __tablename__ = 'user_favourite_folders'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # CASCADE because UserService.delete_user hard deletes the user.
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('staff_users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    # Not unique per user: an unnamed folder falls back to DEFAULT_FOLDER_NAME,
    # so a second unnamed folder would collide with the first.
    name = db.Column(
        db.String(MAX_FOLDER_NAME_LENGTH), nullable=False,
        server_default=DEFAULT_FOLDER_NAME,
    )
    # Whether the folder draws collapsed. Stored rather than left to the client
    # so the panel reopens the way the user left it.
    is_collapsed = db.Column(
        db.Boolean, nullable=False, server_default=expression.false()
    )
    # Position among this user's folders. Not unique; ties break on id.
    sort_order = db.Column(db.Integer, nullable=False, server_default='0')

    @classmethod
    def find_by_user(cls, user_id: int) -> list:
        """Return the user's folders, lowest position first."""
        return (
            cls.query
            .filter_by(user_id=user_id)
            .order_by(cls.sort_order.asc(), cls.id.asc())
            .all()
        )

    @classmethod
    def find_one_for_user(cls, folder_id: int, user_id: int):
        """Return the folder only if it belongs to this user."""
        return cls.query.filter_by(id=folder_id, user_id=user_id).first()

    @classmethod
    def count_for_user(cls, user_id: int) -> int:
        """Return how many folders the user has."""
        return cls.query.filter_by(user_id=user_id).count()

    @classmethod
    def next_sort_order(cls, user_id: int) -> int:
        """Return the position for a new folder - the top of Favourites.

        Below the lowest rather than above the highest, the way a new favourite
        is placed, so a folder the user just made leads the list and the folders
        already stored are left untouched.
        """
        current = (
            db.session.query(func.min(cls.sort_order))
            .filter_by(user_id=user_id)
            .scalar()
        )
        return 1 if current is None else current - 1

    @classmethod
    def create(cls, user_id: int, name: str) -> UserFavouriteFolder:
        """Add a folder at the top of the user's Favourites."""
        folder = cls(
            user_id=user_id,
            name=name,
            is_collapsed=False,
            sort_order=cls.next_sort_order(user_id),
        )
        folder.save()
        return folder
