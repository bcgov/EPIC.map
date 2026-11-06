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

from map_api.utils.constant import NO_ACCESS_ROLE


def auth_guid(token_info) -> str:
    """Return the stable identifier for the user.

    For an IDIR login through the BC Gov identity provider this is
    "<guid>@idir". Unlike the IDIR username it is never reassigned, so it is
    what local records are keyed on.
    """
    return (token_info or {}).get('preferred_username')


def idir_username(token_info) -> str:
    """Return the IDIR username, falling back to preferred_username."""
    token_info = token_info or {}
    return token_info.get('idir_username') or token_info.get('preferred_username')


def groups(token_info):
    """Return the realm groups the token carries."""
    return (token_info or {}).get('groups') or []


def host_app(token_info) -> str:
    """Return the application the request came from, for the audit log.

    This is the `azp` claim - the keycloak client the token was issued to,
    signed by keycloak as part of the token. It is deliberately not derived
    from the Origin header or from a custom X-Host-App header: both are set by
    the caller and can claim to be any application at all.

    Falls back to "unknown" rather than None so that a null in the audit table
    means a bug in this code, not an unauthenticated era of history.
    """
    return (token_info or {}).get('azp') or 'unknown'


def is_allowed_client(token_info) -> bool:
    """Whether the token was issued to a client this API serves.

    This is the audience check, and the only one. It replaces the single
    JWT_OIDC_AUDIENCE comparison that python-jose would otherwise make: this API
    now backs several EPIC applications, each with its own keycloak client in
    the same realm, so one audience string can no longer describe who may call.

    Only `azp`, the client the token was issued to, is read. Keycloak puts every
    client the user holds a role in into `aud`, so `aud` names clients the token
    was never issued to.

    Signature, issuer and expiry are unaffected - they are still verified by
    flask-jwt-oidc before this is consulted.

    An empty allowlist denies everything. A misconfigured deployment should stop
    serving rather than accept tokens from any client in a shared realm.
    """
    allowed = current_app.config.get('ALLOWED_CLIENT_IDS') or []
    if not allowed:
        return False

    return (token_info or {}).get('azp') in allowed


def has_app_access(token_info) -> bool:
    """Whether the token holds a role group under one of ALLOWED_APP_GROUPS, as Track's own access check does."""
    apps = {name.upper() for name in current_app.config.get('ALLOWED_APP_GROUPS') or []}
    paths = (group.strip('/').upper().split('/') for group in groups(token_info))
    return any(len(path) > 1 and path[0] in apps and path[1] != NO_ACCESS_ROLE for path in paths)


def user_data_from_token(token_info):
    """Map token claims onto the columns of the local user record."""
    token_info = token_info or {}
    return {
        'auth_guid': auth_guid(token_info),
        'username': idir_username(token_info),
        'first_name': token_info.get('given_name'),
        'last_name': token_info.get('family_name'),
        'email_address': token_info.get('email'),
    }
