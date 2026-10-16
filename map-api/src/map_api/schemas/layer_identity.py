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
"""Charset rules for the catalogue identifiers the client is trusted for.

Every table that references a catalogue layer stores these identifiers instead
of URLs and lets the client build the addresses, so the patterns below are the
security control, not an absent `service_url` column. They live here rather
than beside one schema because applied layers and favourites must not drift
apart - as does the request schema both lists share. Do not loosen them
without replacing the control.
"""

from marshmallow import EXCLUDE, Schema, fields, validate


# A CKAN dataset uuid. Not a slug: a slug changes when a dataset is retitled
# and the uuid does not, and the metadata link is built from what is stored.
PACKAGE_ID_PATTERN = (
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}'
    r'-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)

# A BCGW object name, e.g. WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES. Excludes
# ':' (smuggling another namespace past the client's 'pub:' prefix), ',' (many
# layers in one LAYERS=) and '/?#%' and whitespace (escaping the parameter).
OBJECT_NAME_PATTERN = r'^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'

# The longest a display name may be, matching the column it is stored in.
MAX_DISPLAY_NAME_LENGTH = 200

# The longest a stored catalogue description may be, matching its column.
MAX_DESCRIPTION_LENGTH = 1000


class CatalogueLayerRequestSchema(Schema):
    """What a client may send when adding a catalogue layer to one of its lists.

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
    # Optional: not every catalogue record has a description or a date.
    description = fields.Str(
        data_key='description', load_default=None, allow_none=True,
        validate=validate.Length(max=MAX_DESCRIPTION_LENGTH),
    )
    last_updated = fields.Date(
        data_key='last_updated', load_default=None, allow_none=True
    )
