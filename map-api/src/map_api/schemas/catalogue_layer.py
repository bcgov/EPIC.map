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

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from map_api.utils.constant import (
    CLIENT_ID_PATTERN, METADATA_MAX_LAYERS, METADATA_MAX_SPAN_DEGREES, OBJECT_NAME_PATTERN)


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


class MetaDataQuerySchema(Schema):
    """The few pixels around a click, as a box in degrees."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    west = fields.Float(required=True, validate=validate.Range(min=-180, max=180))
    south = fields.Float(required=True, validate=validate.Range(min=-90, max=90))
    east = fields.Float(required=True, validate=validate.Range(min=-180, max=180))
    north = fields.Float(required=True, validate=validate.Range(min=-90, max=90))

    @validates_schema
    def validate_box(self, data, **_kwargs):
        """Require a box the right way round, and no bigger than a click."""
        west, south, east, north = (data[side] for side in ('west', 'south', 'east', 'north'))
        if west > east or south > north:
            raise ValidationError('The box must run west to east and south to north.')
        if east - west > METADATA_MAX_SPAN_DEGREES or north - south > METADATA_MAX_SPAN_DEGREES:
            raise ValidationError(
                f'The box may span at most {METADATA_MAX_SPAN_DEGREES} degrees a side.'
            )


class MetaDataBatchSchema(MetaDataQuerySchema):
    """One click: the box, and every layer to identify against it.

    A body rather than a query string because the list is the point - fifty
    object names is past what a URL should carry, and this is a read written as
    a POST for that reason alone.
    """

    object_names = fields.List(
        fields.Str(validate=validate.Regexp(OBJECT_NAME_PATTERN)),
        required=True,
        data_key='objectNames',
        validate=validate.Length(min=1, max=METADATA_MAX_LAYERS),
        metadata={'description': 'Warehouse objects to identify, in the order to answer them'},
    )

    # Which click this is, so one the user has already replaced can be dropped
    # before it reaches the warehouse. 
    client_id = fields.Str(
        load_default=None,
        allow_none=True,
        data_key='clientId',
        validate=validate.Regexp(CLIENT_ID_PATTERN),
        metadata={'description': 'Opaque per-map id, stable for the life of the widget'},
    )
    click_id = fields.Int(
        load_default=None,
        allow_none=True,
        data_key='clickId',
        validate=validate.Range(min=0),
        metadata={'description': "Counts up per click; the client's newest wins"},
    )


class MetaDataLayerSchema(Schema):
    """What one layer of a click had to say."""

    object_name = fields.Str(data_key='objectName')
    # Kept apart from `feature` because a layer with nothing at the point and a
    # layer that could not be asked are different answers, and only one of them
    # is worth a row with a Retry on it.
    status = fields.Str(
        validate=validate.OneOf(['found', 'empty', 'error']),
        metadata={'description': 'found, empty, or error'},
    )
    feature = fields.Nested('MetaDataFeatureSchema', allow_none=True)
    error = fields.Str(
        allow_none=True,
        metadata={'description': 'Why this layer could not answer; null when it did'},
    )


class MetaDataBatchResultSchema(Schema):
    """Every layer of one click, in the order they were asked."""

    results = fields.List(fields.Nested(MetaDataLayerSchema))


class FeatureAttributeSchema(Schema):
    """One column of a feature, in the order the warehouse lists them."""

    name = fields.Str()
    value = fields.Raw(allow_none=True)


class MetaDataFeatureSchema(Schema):
    """The feature under a click."""

    id = fields.Str(
        allow_none=True,
        metadata={'description': 'Warehouse feature id; null when it is not stable'},
    )
    name = fields.Str(
        allow_none=True,
        metadata={
            'description': (
                "What the layer's published style labels this feature; null "
                'when the style labels nothing'
            )
        },
    )
    # A list rather than an object: the column order is the warehouse's, and a
    # JSON object's is not something to rely on across the wire.
    properties = fields.List(fields.Nested(FeatureAttributeSchema))
    geometry = fields.Raw(
        allow_none=True,
        metadata={'description': 'GeoJSON geometry; null when too heavy to carry'},
    )
    bounds = fields.List(
        fields.Float(),
        allow_none=True,
        metadata={'description': 'west, south, east, north; null when unknown'},
    )


class MetaDataSchema(Schema):
    """What a layer has at a point: a feature, or null for nothing."""

    feature = fields.Nested(MetaDataFeatureSchema, allow_none=True)


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
