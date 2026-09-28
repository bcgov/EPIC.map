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
"""Tests for the imported layer and feature models."""
import json

import pytest
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from map_api.models.db import db
from map_api.models.user_layer import UserLayer
from map_api.models.user_layer_feature import UserLayerFeature
from map_api.utils.constant import USER_LAYER_STORAGE_SRID
from tests.utilities.factory_utils import SECOND_AUTH_GUID, SECOND_IDIR_USERNAME, factory_user, factory_user_layer


# Victoria's legislature, in WGS 84.
VICTORIA = {'type': 'Point', 'coordinates': [-123.3701, 48.4196]}


def _add_feature(layer, geometry, properties=None):
    feature = UserLayerFeature(
        layer_id=layer.id,
        geom=func.ST_Transform(
            func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(geometry)), 4326),
            USER_LAYER_STORAGE_SRID,
        ),
        properties=properties or {},
    )
    db.session.add(feature)
    db.session.flush()
    return feature


def test_name_taken_ignores_case_and_surrounding_space(app, session):
    """The widget treats "Roads" and " roads " as one name, so the API does too."""
    user = factory_user()
    factory_user_layer(user.id, name='Roads')

    assert UserLayer.name_taken(user.id, ' roads ')
    assert not UserLayer.name_taken(user.id, 'Rivers')


def test_name_taken_is_per_user(app, session):
    """Another user's layer name is free to reuse."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    factory_user_layer(owner.id, name='Roads')

    assert not UserLayer.name_taken(user.id, 'Roads')


def test_name_taken_can_exclude_the_layer_itself(app, session):
    """A retried upload must not find its own row in the way."""
    user = factory_user()
    layer = factory_user_layer(user.id, name='Roads')

    assert not UserLayer.name_taken(user.id, 'Roads', exclude_id=layer.id)


def test_the_database_refuses_a_name_differing_only_in_case(app, session):
    """The unique index is the backstop for two uploads racing past the check."""
    user = factory_user()
    factory_user_layer(user.id, name='Roads')

    with pytest.raises(IntegrityError):
        factory_user_layer(user.id, name='ROADS')


@pytest.mark.parametrize('column, value', [
    ('source_format', 'CSV'),
    ('geometry_type', 'Raster'),
    ('feature_count', -1),
])
def test_values_outside_the_allowed_set_are_refused(app, session, column, value):
    """The check constraints mirror what the widget can send."""
    user = factory_user()

    with pytest.raises(IntegrityError):
        factory_user_layer(user.id, **{column: value})


def test_find_one_for_user_refuses_another_users_layer(app, session):
    """Ownership is part of the lookup, not a check after it."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    theirs = factory_user_layer(owner.id)

    assert UserLayer.find_one_for_user(theirs.id, user.id) is None
    assert UserLayer.find_one_for_user(theirs.id, owner.id).id == theirs.id


def test_find_by_user_returns_only_this_users_layers(app, session):
    """Two users' layers do not see each other."""
    owner = factory_user(auth_guid=SECOND_AUTH_GUID, username=SECOND_IDIR_USERNAME)
    user = factory_user()
    factory_user_layer(owner.id)
    mine = factory_user_layer(user.id)

    assert [row.id for row in UserLayer.find_by_user(user.id)] == [mine.id]


def test_features_are_stored_in_bc_albers(app, session):
    """WGS 84 in, BC Albers metres on disk."""
    user = factory_user()
    layer = factory_user_layer(user.id, geometry_type='Point')
    feature = _add_feature(layer, VICTORIA, {'NAME': 'Legislature'})

    srid, x, y = db.session.query(
        func.ST_SRID(UserLayerFeature.geom),
        func.ST_X(UserLayerFeature.geom),
        func.ST_Y(UserLayerFeature.geom),
    ).filter(UserLayerFeature.id == feature.id).one()

    assert srid == USER_LAYER_STORAGE_SRID
    # Albers eastings and northings in BC are in the hundreds of thousands of
    # metres, nowhere near a longitude and latitude.
    assert 1_000_000 < x < 1_300_000
    assert 300_000 < y < 500_000
    assert feature.properties == {'NAME': 'Legislature'}


def test_a_layer_may_mix_geometry_types(app, session):
    """The column is generic, since one file can hold points and lines."""
    user = factory_user()
    layer = factory_user_layer(user.id, geometry_type='Mixed')

    _add_feature(layer, VICTORIA)
    _add_feature(layer, {'type': 'LineString', 'coordinates': [[-123.37, 48.42], [-123.36, 48.43]]})

    assert layer.features.count() == 2


def test_deleting_a_layer_deletes_its_features(app, session):
    """Features have no life of their own once their layer is gone."""
    user = factory_user()
    layer = factory_user_layer(user.id)
    _add_feature(layer, VICTORIA)
    layer_id = layer.id

    layer.delete()

    assert UserLayerFeature.query.filter_by(layer_id=layer_id).count() == 0
