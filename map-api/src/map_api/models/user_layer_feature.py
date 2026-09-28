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
"""One feature of an imported layer.

`db.Model` rather than `BaseModel`: a layer can hold tens of thousands of these,
all written at once by the same user, so per-row audit columns would only repeat
the layer's own. The id keeps the order the features had in the file.
"""
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB

from map_api.utils.constant import USER_LAYER_STORAGE_SRID

from .db import db


class UserLayerFeature(db.Model):  # pylint: disable=too-few-public-methods
    """Definition of the imported layer feature entity."""

    __tablename__ = 'user_layer_features'

    __table_args__ = (
        db.Index(
            'ix_user_layer_features_geom', 'geom', postgresql_using='gist',
        ),
    )

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    layer_id = db.Column(
        db.Uuid,
        db.ForeignKey('user_layers.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    # Any geometry type, since a file may mix points, lines and polygons.
    geom = db.Column(
        Geometry('GEOMETRY', srid=USER_LAYER_STORAGE_SRID, spatial_index=False),
        nullable=False,
    )
    # The file's attributes as they came, keys and all.
    properties = db.Column(JSONB, nullable=False, server_default='{}')
