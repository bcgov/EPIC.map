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


def client_ids(token_info):
    """Return every keycloak client the token names, from `aud` and `azp`.

    `aud` may be a single string or a list. `azp` (authorized party) is the
    client the token was actually issued to, and is what distinguishes the EPIC
    applications from each other: in the shared EAO realm every one of them
    receives `aud: "account"`, so `azp` usually carries the real answer.
    """
    token_info = token_info or {}

    audience = token_info.get("aud") or []
    if isinstance(audience, str):
        audience = [audience]
    if not isinstance(audience, list):
        audience = []

    authorized_party = token_info.get("azp")
    return [name for name in [*audience, authorized_party] if name]


def host_app(token_info) -> str:
    """Return the application the request came from, for the audit log.

    This is the `azp` claim - the keycloak client the token was issued to,
    signed by keycloak as part of the token. It is deliberately not derived
    from the Origin header or from a custom X-Host-App header: both are set by
    the caller and can claim to be any application at all.

    Falls back to "unknown" rather than None so that a null in the audit table
    means a bug in this code, not an unauthenticated era of history.
    """
    return (token_info or {}).get("azp") or "unknown"


def is_allowed_client(token_info) -> bool:
    """Whether the token was issued to a client this API serves.

    This is the audience check, and the only one. It replaces the single
    JWT_OIDC_AUDIENCE comparison that python-jose would otherwise make: this API
    now backs several EPIC applications, each with its own keycloak client in
    the same realm, so one audience string can no longer describe who may call.

    Signature, issuer and expiry are unaffected - they are still verified by
    flask-jwt-oidc before this is consulted.

    Deliberately one function with one caller path, so that moving to a
    dedicated scope later is a configuration change and nothing else: once the
    SSO team adds `epic-map-api`, ALLOWED_CLIENT_IDS becomes a single entry and
    the code here is already correct.

    An empty allowlist denies everything. A misconfigured deployment should stop
    serving rather than accept tokens from any client in a shared realm.
    """
    allowed = current_app.config.get("ALLOWED_CLIENT_IDS") or []
    if not allowed:
        return False

    return any(name in allowed for name in client_ids(token_info))


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
