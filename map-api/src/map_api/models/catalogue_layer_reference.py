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
"""One user's ordered list of BC Data Catalogue layers.

Not a table. Applied layers and favourites are both a per-user list of
catalogue layers, identified the same way and looked up the same way which
lives here and each table adds only what is specific to it.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.declarative import declared_attr

from map_api.utils.constant import LAYER_SOURCE_BCDC

from .db import db


# `query` arrives from db.Model on the concrete table this is mixed into, so it
# is not resolvable on the mixin alone.
class CatalogueLayerReference:  # pylint: disable=no-member
    """Columns and lookups shared by every per-user list of catalogue layers."""

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def user_id(cls):  # pylint:disable=no-self-argument # noqa: N805
        """Return the owning user. A ForeignKey cannot be shared between tables.

        CASCADE because UserService.delete_user hard deletes the user.
        """
        return db.Column(
            db.Integer,
            db.ForeignKey('staff_users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        )

    # Which service the layer came from. Project layers will have their own.
    source = db.Column(
        db.String(20), nullable=False, server_default=LAYER_SOURCE_BCDC
    )
    # The CKAN dataset uuid, for the metadata link. Stable across a retitle.
    package_id = db.Column(db.String(100), nullable=False)
    # The BCGW object name - the identity of the thing referenced.
    object_name = db.Column(db.String(200), nullable=False)
    # Snapshot, so the list renders without a call to the catalogue.
    display_name = db.Column(db.String(200), nullable=False)
    # Position in the list. Not unique; ties break on id.
    sort_order = db.Column(db.Integer, nullable=False, server_default='0')

    @classmethod
    def find_by_user(cls, user_id: int):
        """Return the user's rows, lowest position first."""
        return (
            cls.query
            .filter_by(user_id=user_id)
            .order_by(cls.sort_order.asc(), cls.id.asc())
            .all()
        )

    @classmethod
    def find_one_for_user(cls, row_id: int, user_id: int):
        """Return the row only if it belongs to this user."""
        return cls.query.filter_by(id=row_id, user_id=user_id).first()

    @classmethod
    def find_reference(cls, user_id: int, source: str, object_name: str):
        """Return the row for a layer already in this user's list, if any."""
        return cls.query.filter_by(
            user_id=user_id, source=source, object_name=object_name
        ).first()

    @classmethod
    def count_for_user(cls, user_id: int) -> int:
        """Return how many rows the user has."""
        return cls.query.filter_by(user_id=user_id).count()

    @classmethod
    def next_sort_order(cls, user_id: int) -> int:
        """Return the position for the next row added - the end of the list."""
        current = (
            db.session.query(func.max(cls.sort_order))
            .filter_by(user_id=user_id)
            .scalar()
        )
        return (current or 0) + 1

    @classmethod
    def add_reference(cls, user_id: int, data: dict, **extra) -> tuple:
        """Add the layer to the user's list, or return the one already there.

        Returns `(row, created)`. Adding the same layer twice is not an error.
        `extra` carries whatever the concrete table adds of its own.
        """
        source = LAYER_SOURCE_BCDC
        object_name = data['object_name']

        row = cls(
            user_id=user_id,
            source=source,
            package_id=data['package_id'],
            object_name=object_name,
            display_name=data['display_name'],
            sort_order=cls.next_sort_order(user_id),
            **extra,
        )

        try:
            # Savepoint, not a plain insert: a duplicate must not roll back the
            # staff_users row current_user() may have just provisioned. Letting
            # the constraint decide also beats check-then-insert, which two
            # tabs would both pass.
            with db.session.begin_nested():
                db.session.add(row)
            db.session.commit()
            return row, True
        except IntegrityError:
            existing = cls.find_reference(user_id, source, object_name)
            if existing is None:
                raise
            return existing, False
