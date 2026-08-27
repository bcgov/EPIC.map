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
"""Reading claims out of an IDIR access token.

Every claim name the application depends on is named here and nowhere else, so
a change on the identity provider side has one place to land.
"""
from flask import current_app


def auth_guid(token_info) -> str:
    """Return the stable identifier for the user.

    For an IDIR login through the BC Gov identity provider this is
    "<guid>@idir". Unlike the IDIR username it is never reassigned, so it is
    what local records are keyed on.
    """
    return (token_info or {}).get("preferred_username")


def idir_username(token_info) -> str:
    """Return the IDIR username, falling back to preferred_username."""
    token_info = token_info or {}
    return token_info.get("idir_username") or token_info.get("preferred_username")


def groups(token_info):
    """Return the realm groups the token carries."""
    return (token_info or {}).get("groups") or []


def roles(token_info):
    """Return the client roles the token grants for this application."""
    client_id = current_app.config.get("JWT_OIDC_CLIENT_ID")
    resource_access = (token_info or {}).get("resource_access") or {}
    return resource_access.get(client_id, {}).get("roles", [])


def belongs_to_app(token_info) -> bool:
    """Whether the token grants access to this application.

    The EAO realm is shared across the EPIC applications, so once the realm has
    a group for this app, a valid token is not on its own an entitlement to be
    here. Until then AUTH_REQUIRED_GROUP is unset and any IDIR account in the
    realm can sign in - see the startup warning in create_app.
    """
    required_group = (current_app.config.get("AUTH_REQUIRED_GROUP") or "").strip()
    if not required_group:
        return True

    required_group = required_group.upper()
    return any(required_group in group.upper() for group in groups(token_info))


def user_data_from_token(token_info):
    """Map token claims onto the columns of the local user record."""
    token_info = token_info or {}
    return {
        "auth_guid": auth_guid(token_info),
        "username": idir_username(token_info),
        "first_name": token_info.get("given_name"),
        "last_name": token_info.get("family_name"),
        "email_address": token_info.get("email"),
    }
