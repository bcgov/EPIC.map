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
apart. Do not loosen them without replacing the control.
"""


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
