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
AUTH_APP = "MAP"

# What a signed-in user can do before any Keycloak role says otherwise. Roles
# are still to be decided, so every authenticated IDIR user is a plain user;
# any client role the token does carry is added on top of this.
DEFAULT_PERMISSIONS = (PermissionEnum.USER,)

# PermissionEnum -> the Keycloak client role that grants it.
GROUP_MAP = {
    PermissionEnum.SUPERUSER: "super_user",
    PermissionEnum.ADMIN: "admin",
    PermissionEnum.USER: "user",
    PermissionEnum.VIEWER: "viewer",
}
