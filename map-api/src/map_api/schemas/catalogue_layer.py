# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Catalogue layer schemas.

The object name is interpolated into an outbound URL, so the pattern below is
what stops a crafted name addressing something other than the warehouse object
it claims to be. Do not loosen it.
"""

from marshmallow import EXCLUDE, Schema, fields, validate

from map_api.utils.constant import OBJECT_NAME_PATTERN


class NearestFeatureQuerySchema(Schema):
    """Where the user is looking, as the map's centre."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    lon = fields.Float(
        required=True,
        validate=validate.Range(min=-180, max=180),
        metadata={'description': 'Longitude of the map centre'},
    )
    lat = fields.Float(
        required=True,
        validate=validate.Range(min=-90, max=90),
        metadata={'description': 'Latitude of the map centre'},
    )


class NearestFeatureSchema(Schema):
    """Where to put the camera to see the layer."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    bounds = fields.List(
        fields.Float(),
        metadata={'description': 'west, south, east, north'},
    )


class LayerMinZoomSchema(Schema):
    """The zoom a layer starts drawing at, as openmaps publishes it."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    min_zoom = fields.Int(
        allow_none=True,
        data_key='minZoom',
        metadata={
            'description': (
                'Lowest map zoom at which the layer is drawn; null when it '
                'declares no limit and draws at every zoom'
            )
        },
    )


class ObjectNameSchema(Schema):
    """The warehouse object a request names in its path."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    object_name = fields.Str(
        required=True,
        validate=validate.Regexp(OBJECT_NAME_PATTERN),
    )
