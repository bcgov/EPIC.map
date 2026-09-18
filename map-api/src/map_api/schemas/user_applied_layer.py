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
"""Applied layer schemas.

These identifiers are stored instead of URLs and the client builds the
addresses from them, so the patterns in `layer_identity` are the security
control.
"""

from marshmallow import EXCLUDE, Schema, fields, validate

from map_api.utils.constant import DEFAULT_LAYER_OPACITY, MAX_LAYER_OPACITY, MIN_LAYER_OPACITY

from .layer_identity import MAX_DISPLAY_NAME_LENGTH, OBJECT_NAME_PATTERN, PACKAGE_ID_PATTERN

# A CKAN dataset uuid. Not a slug: a slug changes when a dataset is retitled
# and the uuid does not, and the metadata link is built from what is stored.
_PACKAGE_ID_PATTERN = (
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}'
    r'-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)


class UserAppliedLayerSchema(Schema):
    """One layer the user currently has on the map."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.Int(data_key='id')
    source = fields.Str(data_key='source')
    package_id = fields.Str(data_key='package_id')
    object_name = fields.Str(data_key='object_name')
    display_name = fields.Str(data_key='display_name')
    opacity = fields.Int(data_key='opacity')
    sort_order = fields.Int(data_key='sort_order')
    created_date = fields.DateTime(data_key='created_date')
    updated_date = fields.DateTime(data_key='updated_date')


class UserAppliedLayerRequestSchema(Schema):
    """What a client may say when applying a layer.

    No `source`, `sort_order`, `id` or `user_id`: the server decides those, and
    EXCLUDE drops them if sent.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    package_id = fields.Str(
        data_key='package_id', required=True,
        validate=validate.Regexp(PACKAGE_ID_PATTERN),
    )
    object_name = fields.Str(
        data_key='object_name', required=True,
        validate=validate.Regexp(OBJECT_NAME_PATTERN),
    )
    display_name = fields.Str(
        data_key='display_name', required=True,
        validate=validate.Length(min=1, max=MAX_DISPLAY_NAME_LENGTH),
    )
    opacity = fields.Int(
        data_key='opacity', load_default=DEFAULT_LAYER_OPACITY,
        validate=validate.Range(min=MIN_LAYER_OPACITY, max=MAX_LAYER_OPACITY),
    )


class UserAppliedLayerUpdateSchema(Schema):
    """The one thing a client may change about an applied layer.

    Required, so an empty PATCH is a 400 rather than a silent no-op.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    opacity = fields.Int(
        data_key='opacity', required=True,
        validate=validate.Range(min=MIN_LAYER_OPACITY, max=MAX_LAYER_OPACITY),
    )
