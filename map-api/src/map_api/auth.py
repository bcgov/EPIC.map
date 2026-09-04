# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Bring in the common JWT Manager."""
from functools import wraps

from flask import g, request
from flask.globals import request_ctx
from flask_jwt_oidc import JwtManager
from flask_jwt_oidc.exceptions import AuthError
from jose import jwt as jose_jwt

from map_api.exceptions import PermissionDeniedError
from map_api.utils import token as token_utils
from map_api.utils.constant import GROUP_MAP


class MultiClientJwtManager(JwtManager):
    """A JwtManager that accepts tokens from any of several keycloak clients.

    Signature, issuer and expiry validation are unchanged - the same python-jose
    call, the same JWKS lookup, the same errors. The audience decision is the
    only difference.

    It has to be overridden here rather than configured: python-jose compares
    `aud` against exactly one string and raises when it does not match, so with
    several EPIC clients in one realm there is no value of JWT_OIDC_AUDIENCE
    that admits all of them and nothing else. Passing None does not help either
    - jose then rejects every token that carries an `aud` at all. So the aud
    check is turned off in the decode call and replaced, immediately after, by
    token_utils.is_allowed_client against the *verified* claims.

    Overriding here rather than in the request hook means every entry point the
    library offers - requires_auth, has_one_of_roles, requires_roles - goes
    through the same check, including @auth.require on individual resources.

    Pinned against flask-jwt-oidc==0.7.0; this mirrors JwtManager._validate_token
    from that release.
    """

    def _validate_token(self, token):
        try:
            unverified_header = jose_jwt.get_unverified_header(token)
        except jose_jwt.JWTError as jerr:
            raise AuthError({'code': 'invalid_header',
                             'description':
                                 'Invalid header. '
                                 'Use an RS256 signed JWT Access Token'}, 401) from jerr

        if unverified_header.get('alg') == 'HS256':
            raise AuthError({'code': 'invalid_header',
                             'description':
                                 'Invalid header. '
                                 'Use an RS256 signed JWT Access Token'}, 401)

        if 'kid' not in unverified_header:
            raise AuthError({'code': 'invalid_header',
                             'description':
                                 'Invalid header. '
                                 'No KID in token header'}, 401)

        rsa_key = self.get_rsa_key(self.get_jwks(), unverified_header['kid'])

        if not rsa_key and self.caching_enabled:
            # Could be key rotation, invalidate the cache and try again
            self.cache.delete('jwks')
            rsa_key = self.get_rsa_key(self.get_jwks(), unverified_header['kid'])

        if not rsa_key:
            raise AuthError({'code': 'invalid_header',
                             'description': 'Unable to find jwks key referenced in token'}, 401)

        try:
            payload = jose_jwt.decode(
                token,
                rsa_key,
                algorithms=self.algorithms,
                issuer=self.issuer,
                # The audience is checked below instead, against the allowlist.
                # Everything else jose verifies here is unchanged.
                options={'verify_aud': False},
            )
        except jose_jwt.ExpiredSignatureError as sig:
            raise AuthError({'code': 'token_expired',
                             'description': 'token has expired'}, 401) from sig
        except jose_jwt.JWTClaimsError as jwe:
            raise AuthError({'code': 'invalid_claims',
                             'description':
                                 'incorrect claims,'
                                 ' please check the audience and issuer'}, 401) from jwe
        except Exception as exc:  # noqa: B902; mirrors the library's catch-all
            raise AuthError({'code': 'invalid_header',
                             'description':
                                 'Unable to parse authentication'
                                 ' token.'}, 401) from exc

        # Checked against verified claims, never the unverified header, so a
        # token cannot name an allowed client without also being genuine.
        if not token_utils.is_allowed_client(payload):
            raise AuthError({'code': 'invalid_claims',
                             'description':
                                 'Token was issued to a client this API does'
                                 ' not serve'}, 401)

        request_ctx.current_user = g.jwt_oidc_token_info = payload


jwt = (
    MultiClientJwtManager()
)  # pylint: disable=invalid-name; lower case name as used by convention in most Flask apps


class Auth:  # pylint: disable=too-few-public-methods
    """Extending JwtManager to include additional functionalities."""

    @classmethod
    def require(cls, f):
        """Validate the Bearer Token."""

        @jwt.requires_auth
        @wraps(f)
        def decorated(*args, **kwargs):
            g.authorization_header = request.headers.get("Authorization", None)
            g.token_info = g.jwt_oidc_token_info

            return f(*args, **kwargs)

        return decorated

    @classmethod
    def has_one_of_roles(cls, permissions):
        """Check that at least one of the given permissions is granted by the token.

        Args:
            permissions [PermissionEnum,]: permissions, any one of which allows the call
        """

        def decorated(f):
            @Auth.require
            @wraps(f)
            def wrapper(*args, **kwargs):
                mapped_permissions = Auth.map_permission_to_groups(permissions)
                if jwt.contains_role(roles=mapped_permissions):
                    return f(*args, **kwargs)

                raise PermissionDeniedError(
                    "You don't have permission to perform this operation."
                )

            return wrapper

        return decorated

    @classmethod
    def has_role(cls, role):
        """Validate the role."""
        return jwt.validate_roles(required_roles=role)

    @classmethod
    def has_permission(cls, permissions):
        """Check to see if the user has the right permissions."""
        mapped_permissions = Auth.map_permission_to_groups(permissions)
        return jwt.contains_role(roles=mapped_permissions)

    @staticmethod
    def map_permission_to_groups(permissions):
        """Map the permissions to the client roles configured in keycloak."""
        return [GROUP_MAP[permission] for permission in permissions]


auth = (
    Auth()
)
