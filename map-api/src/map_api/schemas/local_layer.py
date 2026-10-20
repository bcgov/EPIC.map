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

The style is dumped through a schema rather than echoed: what an endpoint
promises should be a stated shape, even when our own ingest wrote the value.
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

    A translucent polygon needs a fill and a line, so one hosted layer is
    several of these. The first is at the bottom.
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


class LocalLayerInfoSchema(Schema):
    """What the panel says about a hosted layer itself, rather than its features."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    object_name = fields.Str(data_key='objectName')
    loaded_date = fields.DateTime(
        data_key='loadedDate',
        allow_none=True,
        metadata={'description': 'When the rows being served were loaded, UTC'},
    )


def _contact_field(key: str, description: str) -> fields.Str:
    """One field of a stored contact, keyed as the blob stores it.

    The key is both the attribute read out of the jsonb and the name it is
    dumped under, which is what lets the whitelist below be one line per field.
    """
    return fields.Str(
        attribute=key,
        data_key=key,
        allow_none=True,
        metadata={'description': description},
    )


class LocalContactSchema(Schema):
    """One nation's entry on a consultation area, as the popup reads it.

    A whitelist, and the second of the two: the ingest already selects only
    these fields out of the extract, and declaring them again here is what
    keeps a field that reappears in the stored blob - an older load, a row put
    there by hand - from reaching a browser. Everything undeclared is dropped
    on the way out.

    The gate in front of this is an IDIR token in the realm, which is not a
    decision about who may read contact details, so what is served is the six
    fields the popup shows plus the identity it pages them by. The extract's
    emails, fax numbers, titles, comments, metadata and additional information
    are not ingested and not served; PRIVATE_CONTACT_COMMENT stays out unless
    the data custodian asks for it.

    Each field is declared through _contact_field, which names it once: the
    blob transform.sql writes is keyed in camelCase and goes out that way, so
    the stored key and the wire key are the same string, and the attribute
    beside it is snake_case because the rest of this module is.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    contact_guid = _contact_field(
        'contactGuid', "The warehouse's identifier for this entry")
    organization_type = _contact_field(
        'organizationType', 'Band, House, Tribal Council and so on, as a code')
    organization_name = _contact_field(
        'organizationName', 'The nation or council')
    contact_name = _contact_field(
        'contactName', 'Who is recorded where there is no organisation')
    address = _contact_field('address', 'Street or box, as recorded')
    city = _contact_field('city', 'City or town')
    province = _contact_field('province', 'Province or territory')
    postal_code = _contact_field('postalCode', 'Postal code')
    phone_number = _contact_field('phoneNumber', 'Phone number, digits only')


class LocalLayerFeatureSchema(Schema):
    """One consultation area, with the contacts folded into it.

    The contacts carry an address and a phone number, so the endpoint is behind
    the same IDIR gate as everything else under /api, and carries no more of
    the warehouse's contact record than the popup draws - see
    LocalContactSchema.
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
    contacts = fields.List(
        fields.Nested(LocalContactSchema),
        metadata={'description': 'One entry per nation recorded on this area'},
    )
    bounds = fields.List(
        fields.Float(),
        metadata={'description': 'West, south, east, north in degrees'},
    )


class TileAddressSchema(Schema):
    """One tile address.

    Checked rather than trusted: an out-of-range address costs a query that can
    only return nothing, and z picks the geometry column.
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

    Bound, not interpolated, but checked anyway: a 32-character hex identifier
    is what the tiles hand out and anything else is a caller guessing.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    # Every layer that serves a record keys on the warehouse's 32-character
    # GUID with the separators stripped. A layer keyed otherwise is refused by
    # serves_feature_detail before this runs, so widening it here would only
    # add a branch nothing can reach.
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
