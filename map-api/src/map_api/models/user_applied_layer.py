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

Opacity is what an applied layer adds to the shared catalogue reference: it is
drawn, so it has render state.
"""
from __future__ import annotations

from map_api.utils.constant import DEFAULT_LAYER_OPACITY

from .base_model import BaseModel
from .catalogue_layer_reference import CatalogueLayerReference
from .db import db


class UserAppliedLayer(CatalogueLayerReference, BaseModel):
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

    opacity = db.Column(
        db.SmallInteger, nullable=False, server_default=str(DEFAULT_LAYER_OPACITY)
    )

    @classmethod
    def apply_layer(cls, user_id: int, data: dict) -> tuple[UserAppliedLayer, bool]:
        """Add the layer to the map, or return the one already there.

        Returns `(row, created)`. Re-applying is not an error, and leaves the
        opacity and stacking position the user already chose alone.
        """
        return cls.add_reference(
            user_id, data, opacity=data.get('opacity', DEFAULT_LAYER_OPACITY)
        )

    def set_opacity(self, opacity: int) -> UserAppliedLayer:
        """Change how transparent this layer draws."""
        self.opacity = opacity
        self.save()
        return self
