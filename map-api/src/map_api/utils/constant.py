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
"""Constants."""

from .enum import PermissionEnum


# The application's name in the shared EAO Keycloak realm. Used as the default
# value of AUTH_REQUIRED_GROUP when group gating is switched on.
AUTH_APP = 'MAP'

# What a signed-in user can do before any Keycloak role says otherwise. Roles
# are still to be decided, so every authenticated IDIR user is a plain user;
# any client role the token does carry is added on top of this.
DEFAULT_PERMISSIONS = (PermissionEnum.USER,)

# PermissionEnum -> the Keycloak client role that grants it.
GROUP_MAP = {
    PermissionEnum.SUPERUSER: 'super_user',
    PermissionEnum.ADMIN: 'admin',
    PermissionEnum.USER: 'user',
    PermissionEnum.VIEWER: 'viewer',
}

# Where an applied layer came from. Only the bc catalogue is written currently.
LAYER_SOURCE_BCDC = 'bcdc'

# Opacity is stored as a percentage rather than a fraction.
DEFAULT_LAYER_OPACITY = 100
MIN_LAYER_OPACITY = 0
MAX_LAYER_OPACITY = 100

# Max layers per map for performance
MAX_APPLIED_LAYERS_PER_MAP = 50

# Favourites are a bookmark list, not layers drawn on the map
MAX_FAVOURITE_LAYERS = 200

# Favourites may be filed into folders. A folder holds no layer state of its
# own, so it is capped separately from the layers inside it.
MAX_FAVOURITE_FOLDERS = 50

# What an unnamed folder is called. The client shows this pre-selected when a
# folder is created, and a name that is blank or only whitespace falls back to it.
DEFAULT_FOLDER_NAME = 'Untitled folder'

# The longest a folder name may be, matching the column it is stored in.
MAX_FOLDER_NAME_LENGTH = 100
