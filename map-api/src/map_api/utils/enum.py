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
"""Enum definitions."""
from enum import Enum


class HttpMethod(Enum):
    """Http methods."""

    GET = "GET"
    PUT = "PUT"
    POST = "POST"
    PATCH = "PATCH"
    DELETE = "DELETE"


class PermissionEnum(Enum):
    """Permission levels a user can hold in the application.

    These are the API's vocabulary. They are mapped onto the client roles
    configured in Keycloak by GROUP_MAP in utils/constant.py, so the two can
    be renamed independently of each other.
    """

    VIEWER = "Viewer"
    USER = "User"
    SUPERUSER = "Superuser"
    ADMIN = "Admin"
