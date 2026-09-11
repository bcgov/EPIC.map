# Copyright © 2024 Province of British Columbia
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
"""Applied map layers: the set a user currently has switched on.

Identifiers only, no URLs - the client builds those. The schema module has the
charset rules that make that safe.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from map_api.utils.constant import DEFAULT_LAYER_OPACITY, LAYER_SOURCE_BCDC

from .base_model import BaseModel
from .db import db


class UserAppliedLayer(BaseModel):
    """Definition of the applied layer entity."""

    __tablename__ = 'user_applied_layers'

    __table_args__ = (
        db.CheckConstraint(
            'opacity >= 0 AND opacity <= 100',
            name='ck_user_applied_layers_opacity_range',
        ),
        db.UniqueConstraint(
            'user_id', 'source', 'object_name',
            name='uq_user_applied_layers_identity',
        ),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # CASCADE because UserService.delete_user hard deletes the user.
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('staff_users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    # Which service the layer came from. Project layers will have their own.
    source = db.Column(
        db.String(20), nullable=False, server_default=LAYER_SOURCE_BCDC
    )
    # The CKAN dataset, for the metadata link.
    package_id = db.Column(db.String(100), nullable=False)
    # The BCGW object name - the identity of the thing drawn.
    object_name = db.Column(db.String(200), nullable=False)
    # Snapshot, so the list renders without a call to the catalogue.
    display_name = db.Column(db.String(200), nullable=False)
    opacity = db.Column(
        db.SmallInteger, nullable=False, server_default=str(DEFAULT_LAYER_OPACITY)
    )
    # Higher draws on top. Not unique; ties break on id.
    sort_order = db.Column(db.Integer, nullable=False, server_default='0')

    @classmethod
    def find_by_user(cls, user_id: int) -> list[UserAppliedLayer]:
        """Return the user's applied layers, bottom of the stack first."""
        return (
            cls.query
            .filter_by(user_id=user_id)
            .order_by(cls.sort_order.asc(), cls.id.asc())
            .all()
        )

    @classmethod
    def find_one_for_user(cls, layer_id: int, user_id: int) -> Optional[UserAppliedLayer]:
        """Return the row only if it belongs to this user."""
        return cls.query.filter_by(id=layer_id, user_id=user_id).first()

    @classmethod
    def find_applied(
        cls, user_id: int, source: str, object_name: str
    ) -> Optional[UserAppliedLayer]:
        """Return the row for a layer already on the map, if there is one."""
        return cls.query.filter_by(
            user_id=user_id, source=source, object_name=object_name
        ).first()

    @classmethod
    def count_for_user(cls, user_id: int) -> int:
        """Return how many layers the user has applied."""
        return cls.query.filter_by(user_id=user_id).count()

    @classmethod
    def next_sort_order(cls, user_id: int) -> int:
        """Return the stacking position for the next layer applied - the top."""
        current = (
            db.session.query(func.max(cls.sort_order))
            .filter_by(user_id=user_id)
            .scalar()
        )
        return (current or 0) + 1

    @classmethod
    def apply_layer(cls, user_id: int, data: dict) -> tuple[UserAppliedLayer, bool]:
        """Add the layer to the map, or return the one already there.

        Returns `(row, created)`. Re-applying is not an error.
        """
        source = LAYER_SOURCE_BCDC
        object_name = data['object_name']

        row = cls(
            user_id=user_id,
            source=source,
            package_id=data['package_id'],
            object_name=object_name,
            display_name=data['display_name'],
            opacity=data.get('opacity', DEFAULT_LAYER_OPACITY),
            sort_order=cls.next_sort_order(user_id),
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
            existing = cls.find_applied(user_id, source, object_name)
            if existing is None:
                raise
            return existing, False

    def set_opacity(self, opacity: int) -> UserAppliedLayer:
        """Change how transparent this layer draws."""
        self.opacity = opacity
        self.save()
        return self
