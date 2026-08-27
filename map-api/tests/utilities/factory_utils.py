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
"""Test Utils.

Test Utility for creating model factory.
"""
import time

from faker import Faker
from flask import g

from map_api.config import get_named_config

CONFIG = get_named_config('testing')
fake = Faker()

# kid identifies the signing key, and must match the kid of the keypair in
# TestConfig - it is not the audience.
JWT_HEADER = {
    'alg': CONFIG.JWT_OIDC_TEST_ALGORITHMS or 'RS256',
    'typ': 'JWT',
    'kid': CONFIG.JWT_OIDC_TEST_KEYS['keys'][0]['kid'],
}

TEST_AUTH_GUID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90@idir'
TEST_IDIR_USERNAME = 'JSMITH'


def idir_claims(**overrides):
    """Return the claims an IDIR access token from the EAO realm carries.

    The shape matters more than the values: the API reads groups to decide who
    may be here at all, and resource_access to decide what they may do.
    """
    now = int(time.time())
    claims = {
        'iss': CONFIG.JWT_OIDC_TEST_ISSUER,
        'aud': CONFIG.JWT_OIDC_TEST_AUDIENCE,
        'sub': TEST_AUTH_GUID,
        'iat': now,
        'exp': now + 300,
        'preferred_username': TEST_AUTH_GUID,
        'idir_username': TEST_IDIR_USERNAME,
        'given_name': 'Jane',
        'family_name': 'Smith',
        'email': 'jane.smith@gov.bc.ca',
        'groups': ['/EPIC/MAP/user'],
        'resource_access': {
            CONFIG.JWT_OIDC_CLIENT_ID: {'roles': ['user']},
        },
    }
    claims.update(overrides)
    return claims


def factory_auth_header(jwt, claims=None, **overrides):
    """Return an Authorization header carrying a signed test token."""
    token = jwt.create_jwt(claims or idir_claims(**overrides), JWT_HEADER)
    return {'Authorization': f'Bearer {token}'}


def set_global_tenant(tenant_id=1):
    """Set the global tenant id."""
    g.tenant_id = tenant_id
