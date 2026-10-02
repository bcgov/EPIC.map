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
"""Locally hosted layer schemas.

The style is a JSON blob the client hands to MapLibre, so it is dumped through a
schema rather than echoed: what the endpoint promises should be a stated shape,
even when the value on the way out was written by our own ingest.
"""

from marshmallow import EXCLUDE, Schema, fields, validate

from map_api.utils.constant import OBJECT_NAME_PATTERN


class LocalLayerSourceSchema(Schema):
    """The zoom range tiles are asked for over."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    min_zoom = fields.Int(
        data_key='minZoom',
        allow_none=True,
        metadata={'description': 'Zoom the layer starts drawing at'},
    )
    max_zoom = fields.Int(
        data_key='maxZoom',
        metadata={'description': 'Deepest zoom tiles are generated for'},
    )


class LocalLayerSpecSchema(Schema):
    """One MapLibre layer drawn from the tile, in the order it is drawn.

    A translucent polygon needs a fill and a line over the same features and a
    point needs a circle, so one hosted layer is several of these. Order is the
    draw order: the first is at the bottom.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.Str(
        metadata={'description': 'Distinguishes this layer from the others '
                                 'drawn from the same source'},
    )
    type = fields.Str(
        metadata={'description': 'MapLibre layer type: fill, line or circle'},
    )
    source_layer = fields.Str(
        data_key='sourceLayer',
        metadata={'description': 'Layer name inside the vector tile'},
    )
    min_zoom = fields.Int(
        data_key='minZoom',
        allow_none=True,
        metadata={'description': 'Zoom this layer starts drawing at, where it '
                                 'differs from the source'},
    )
    filter = fields.Raw(
        allow_none=True,
        metadata={'description': 'MapLibre filter expression, or null'},
    )
    layout = fields.Raw(
        metadata={'description': 'MapLibre layout properties'},
    )
    paint = fields.Raw(
        metadata={'description': 'MapLibre paint properties'},
    )


class LocalLayerStyleSchema(Schema):
    """How the client should draw a layer we host."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    source = fields.Nested(LocalLayerSourceSchema)
    layers = fields.List(fields.Nested(LocalLayerSpecSchema))
    manifest = fields.Raw(
        metadata={'description': 'What the style translation covered'},
    )


class LocalLayerFeatureSchema(Schema):
    """One consultation area, with the contacts folded into it.

    The contacts hold personal details - names, addresses, phone numbers, email
    addresses and the private comment field. The endpoint that dumps this is
    behind the same IDIR gate as everything else under /api, which is the
    protection this data is required to have.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    cnsltn_area_guid = fields.Str(data_key='consultationAreaId')
    cnsltn_area_name = fields.Str(data_key='name')
    cnsltn_area_label = fields.Int(data_key='label', allow_none=True)
    cnsltn_area_mapsource = fields.Str(data_key='mapSource', allow_none=True)
    cnsltn_area_verified_ind = fields.Str(data_key='verified', allow_none=True)
    cnsltn_area_low_confidence_ind = fields.Str(
        data_key='lowConfidence', allow_none=True
    )
    cnsltn_area_sensitivity = fields.Str(data_key='sensitivity', allow_none=True)
    cnsltn_area_asserted_agg_ind = fields.Str(
        data_key='assertedAggregate', allow_none=True
    )
    cnsltn_area_update_date = fields.Date(data_key='updatedDate', allow_none=True)
    contact_type = fields.Str(data_key='contactType', allow_none=True)
    feature_code = fields.Str(data_key='featureCode', allow_none=True)
    feature_area_sqm = fields.Float(data_key='areaSquareMetres', allow_none=True)
    feature_length_m = fields.Float(data_key='perimeterMetres', allow_none=True)
    contact_count = fields.Int(data_key='contactCount')
    contacts = fields.Raw(
        metadata={'description': 'Every contact recorded for this area'},
    )


class TileAddressSchema(Schema):
    """One tile address.

    Bounds are checked rather than trusted: an out-of-range address costs a
    query that can only return nothing, and z is what picks the geometry column.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    # 24 is where MapLibre stops; nothing addressable is deeper.
    z = fields.Int(required=True, validate=validate.Range(min=0, max=24))
    x = fields.Int(required=True, validate=validate.Range(min=0))
    y = fields.Int(required=True, validate=validate.Range(min=0))


class FeatureKeySchema(Schema):
    """The feature being asked for.

    The key is interpolated into no SQL - it is bound - but it is checked
    anyway, because a 32-character hex identifier is what the tiles hand out
    and anything else is a caller guessing.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    feature_key = fields.Str(
        required=True,
        validate=validate.Regexp(r'^[0-9A-Fa-f]{32}$'),
        metadata={'description': 'The feature identifier carried in the tile'},
    )


class LocalObjectNameSchema(Schema):
    """The layer being asked for."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    object_name = fields.Str(
        required=True,
        validate=validate.Regexp(OBJECT_NAME_PATTERN),
        metadata={'description': 'The BCGW object name of a layer we host'},
    )
