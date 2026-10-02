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
"""Imported layer schemas.

The request is a multipart form, so every field arrives as a string; the
features travel beside it as a file and are read by the service, not here.
Messages for the fields the user types match the ones the widget shows.
"""

from collections.abc import Mapping

from marshmallow import EXCLUDE, Schema, ValidationError, fields, pre_load, validate, validates_schema

from map_api.utils.constant import (
    MAX_USER_LAYER_DESCRIPTION_LENGTH, MAX_USER_LAYER_NAME_LENGTH, USER_LAYER_SOURCE_FORMATS)


NAME_TOO_LONG = f'Enter a layer name of {MAX_USER_LAYER_NAME_LENGTH} characters or fewer.'
DESCRIPTION_TOO_LONG = f'Enter a description of {MAX_USER_LAYER_DESCRIPTION_LENGTH} characters or fewer.'

NAME_RULES = [
    validate.Length(min=1, error='Enter a layer name.'),
    validate.Length(max=MAX_USER_LAYER_NAME_LENGTH, error=NAME_TOO_LONG),
]
DESCRIPTION_RULE = validate.Length(max=MAX_USER_LAYER_DESCRIPTION_LENGTH, error=DESCRIPTION_TOO_LONG)


def _tidied(data, trimmed: tuple, optional: tuple):
    """Trim the typed fields, and read a blank optional one as absent.

    Anything but an object is passed on untouched, for marshmallow to refuse.
    """
    if not isinstance(data, Mapping):
        return data
    data = dict(data)
    for key in trimmed:
        if isinstance(data.get(key), str):
            data[key] = data[key].strip()
    for key in optional:
        if data.get(key) == '':
            data[key] = None
    return data


class UserLayerSchema(Schema):
    """One imported layer, without its features."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.UUID(data_key='id')
    name = fields.Str(data_key='name')
    description = fields.Str(data_key='description', allow_none=True)
    is_sensitive = fields.Bool(data_key='is_sensitive')
    source_format = fields.Str(data_key='source_format')
    source_filename = fields.Str(data_key='source_filename')
    source_crs = fields.Str(data_key='source_crs', allow_none=True)
    geometry_type = fields.Str(data_key='geometry_type')
    feature_count = fields.Int(data_key='feature_count')
    extent = fields.Method('get_extent', data_key='extent')
    created_date = fields.DateTime(data_key='created_date')

    @staticmethod
    def get_extent(layer):
        """Return [west, south, east, north], or None for a layer with no extent."""
        bounds = layer.extent_bounds
        return None if not bounds or bounds[0] is None else list(bounds)


class UserLayerImportSchema(Schema):
    """The form fields sent beside an imported layer's features."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    name = fields.Str(
        data_key='name', required=True, validate=NAME_RULES,
        error_messages={'required': 'Enter a layer name.'},
    )
    description = fields.Str(
        data_key='description', load_default=None, allow_none=True, validate=DESCRIPTION_RULE,
    )
    is_sensitive = fields.Bool(
        data_key='is_sensitive', required=True,
        error_messages={'required': 'Select whether this layer contains sensitive information'},
    )
    source_format = fields.Str(
        data_key='source_format', required=True,
        validate=validate.OneOf(USER_LAYER_SOURCE_FORMATS),
    )
    source_filename = fields.Str(
        data_key='source_filename', required=True,
        validate=validate.Length(min=1, max=255),
    )
    source_crs = fields.Str(
        data_key='source_crs', load_default=None, allow_none=True,
        validate=validate.Length(max=255),
    )

    @pre_load
    def tidy(self, data, **kwargs):  # pylint: disable=unused-argument
        """Trim the typed fields, and read a blank optional one as absent."""
        return _tidied(
            data, ('name', 'description', 'source_filename', 'source_crs'), ('description', 'source_crs')
        )


class UserLayerUpdateSchema(Schema):
    """What may change once a layer is stored: its name, description and sensitivity.

    Each is optional, so a PATCH sends only what changed, but the same rules
    as an import apply to what it sends.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    name = fields.Str(data_key='name', validate=NAME_RULES)
    description = fields.Str(data_key='description', allow_none=True, validate=DESCRIPTION_RULE)
    is_sensitive = fields.Bool(data_key='is_sensitive')

    @pre_load
    def tidy(self, data, **kwargs):  # pylint: disable=unused-argument
        """Trim the typed fields, and read a blank description as absent."""
        return _tidied(data, ('name', 'description'), ('description',))

    @validates_schema
    def at_least_one_field(self, data, **kwargs):  # pylint: disable=unused-argument
        """Refuse a PATCH that asks for nothing."""
        if not data:
            raise ValidationError('Send a name, description or is_sensitive.')
