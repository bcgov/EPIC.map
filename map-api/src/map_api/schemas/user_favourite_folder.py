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
"""Favourite folder schemas.

A folder carries no catalogue identity, so none of the `layer_identity` rules
apply here. The one thing a client supplies is a name, which is stored as typed
apart from the trimming and the fallback the service applies.
"""

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from map_api.utils.constant import MAX_FOLDER_NAME_LENGTH


class UserFavouriteFolderSchema(Schema):
    """One folder in the user's Favourites."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.Int(data_key='id')
    name = fields.Str(data_key='name')
    is_collapsed = fields.Bool(data_key='is_collapsed')
    sort_order = fields.Int(data_key='sort_order')
    created_date = fields.DateTime(data_key='created_date')
    updated_date = fields.DateTime(data_key='updated_date')


class UserFavouriteFolderRequestSchema(Schema):
    """What a client may send when creating a folder.

    The name is optional: the client creates the folder and names it after, so
    a folder committed without one takes the default name.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    name = fields.Str(
        data_key='name', load_default=None, allow_none=True,
        validate=validate.Length(max=MAX_FOLDER_NAME_LENGTH),
    )


class UserFavouriteFolderUpdateSchema(Schema):
    """What a client may change about a folder: its name, whether it is collapsed.

    Both are optional so a rename need not restate the collapsed state, but an
    empty PATCH is a 400 rather than a silent no-op.
    """

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    name = fields.Str(
        data_key='name', allow_none=True,
        validate=validate.Length(max=MAX_FOLDER_NAME_LENGTH),
    )
    is_collapsed = fields.Bool(data_key='is_collapsed')

    @validates_schema
    def at_least_one_field(self, data, **kwargs):  # pylint: disable=unused-argument
        """Refuse a PATCH that asks for nothing."""
        if not data:
            raise ValidationError('Send a name, is_collapsed, or both.')
