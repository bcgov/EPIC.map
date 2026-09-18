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
"""Favourite layer schemas.

These identifiers are stored instead of URLs and the client builds the
addresses from them.
"""

from marshmallow import EXCLUDE, Schema, fields, validate

from .layer_identity import MAX_DISPLAY_NAME_LENGTH, OBJECT_NAME_PATTERN, PACKAGE_ID_PATTERN


class UserFavouriteLayerSchema(Schema):
    """One layer the user has starred."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.Int(data_key='id')
    source = fields.Str(data_key='source')
    package_id = fields.Str(data_key='package_id')
    object_name = fields.Str(data_key='object_name')
    display_name = fields.Str(data_key='display_name')
    folder_id = fields.Int(data_key='folder_id', allow_none=True)
    sort_order = fields.Int(data_key='sort_order')
    created_date = fields.DateTime(data_key='created_date')
    updated_date = fields.DateTime(data_key='updated_date')


class UserFavouriteLayerRequestSchema(Schema):
    """What a client may send when starring a layer."""

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


class UserFavouriteLayerUpdateSchema(Schema):
    """Where a favourite lives: a folder, or the top level.

    `folder_id` is required and nullable rather than optional, so a client
    always says which container it means - null is "the top level", not
    "leave it where it is".
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    folder_id = fields.Int(data_key='folder_id', required=True, allow_none=True)


class UserFavouriteLayerOrderSchema(Schema):
    """The new order of one container's favourites, as a complete list of ids.

    The whole list rather than one moved id: a drag is then one request.
    Required and non empty. An empty PUT is a 400.

    `folder_id` names the container being reordered and defaults to the top
    level, so a client with no folders sends what it always sent. Positions
    only ever compare inside one container, so a reorder cannot move a layer
    between them - that is a PATCH on the favourite.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    favourite_ids = fields.List(
        fields.Int(), data_key='favourite_ids', required=True,
        validate=validate.Length(min=1),
    )
    folder_id = fields.Int(
        data_key='folder_id', load_default=None, allow_none=True
    )
