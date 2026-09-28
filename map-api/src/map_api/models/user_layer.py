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
"""Layers a user imports from a file of their own.

The id is chosen by the client, so an upload that is retried after its
connection dropped lands on the row the first attempt may already have written
rather than beside it. The features live in `user_layer_features`.
"""
from __future__ import annotations

from geoalchemy2 import Geometry
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.orm import column_property

from map_api.utils.constant import (
    MAX_USER_LAYER_DESCRIPTION_LENGTH, MAX_USER_LAYER_NAME_LENGTH, USER_LAYER_GEOMETRY_TYPES, USER_LAYER_SOURCE_FORMATS)

from .base_model import BaseModel
from .db import db


def _one_of(column: str, values: tuple) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class UserLayer(BaseModel):
    """Definition of the imported layer entity."""

    __tablename__ = 'user_layers'

    __table_args__ = (
        # Case-insensitive, so "Roads" and "roads" are the same layer - the
        # comparison the widget makes before it lets the user submit.
        db.Index(
            'uq_user_layers_user_id_name', 'user_id', func.lower(db.text('name')),
            unique=True,
        ),
        db.CheckConstraint(
            _one_of('source_format', USER_LAYER_SOURCE_FORMATS),
            name='ck_user_layers_source_format',
        ),
        db.CheckConstraint(
            _one_of('geometry_type', USER_LAYER_GEOMETRY_TYPES),
            name='ck_user_layers_geometry_type',
        ),
        db.CheckConstraint(
            'feature_count >= 0', name='ck_user_layers_feature_count',
        ),
    )

    id = db.Column(db.Uuid, primary_key=True)

    # CASCADE because UserService.delete_user hard deletes the user.
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('staff_users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(MAX_USER_LAYER_NAME_LENGTH), nullable=False)
    description = db.Column(db.String(MAX_USER_LAYER_DESCRIPTION_LENGTH), nullable=True)
    # A flag only for now; no restriction reads it yet. No default: the user
    # must answer the question.
    is_sensitive = db.Column(db.Boolean, nullable=False)

    source_format = db.Column(db.String(20), nullable=False)
    source_filename = db.Column(db.String(255), nullable=False)
    # What the file was converted from; null when it arrived in WGS 84.
    source_crs = db.Column(db.String(255), nullable=True)

    geometry_type = db.Column(db.String(20), nullable=False)
    feature_count = db.Column(db.Integer, nullable=False, server_default='0')
    # WGS 84 rather than the features' BC Albers, since the map is what zooms
    # to it. An envelope, so it collapses to a point or line for a layer that
    # has no area.
    extent = db.Column(
        Geometry('GEOMETRY', srid=4326, spatial_index=False), nullable=True
    )
    # The extent as [west, south, east, north], the shape the widget zooms to.
    # Read in the query so nothing here has to decode WKB.
    extent_bounds = column_property(array([
        func.ST_XMin(extent), func.ST_YMin(extent),
        func.ST_XMax(extent), func.ST_YMax(extent),
    ]))

    features = db.relationship(
        'UserLayerFeature', lazy='dynamic', passive_deletes=True,
        cascade='all, delete-orphan',
    )

    @classmethod
    def find_by_user(cls, user_id: int) -> list:
        """Return the user's layers, newest first."""
        return (
            cls.query
            .filter_by(user_id=user_id)
            .order_by(cls.created_date.desc(), cls.id.asc())
            .all()
        )

    @classmethod
    def find_one_for_user(cls, layer_id, user_id: int):
        """Return the layer only if it belongs to this user."""
        return cls.query.filter_by(id=layer_id, user_id=user_id).first()

    @classmethod
    def name_taken(cls, user_id: int, name: str, exclude_id=None) -> bool:
        """Whether the user already has a layer by this name, ignoring case."""
        query = cls.query.filter(
            cls.user_id == user_id,
            func.lower(cls.name) == name.strip().lower(),
        )
        if exclude_id is not None:
            query = query.filter(cls.id != exclude_id)
        return db.session.query(query.exists()).scalar()
