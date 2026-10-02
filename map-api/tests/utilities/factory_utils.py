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
import uuid

from faker import Faker
from flask import g

from map_api.config import get_named_config
from map_api.models.user import User as UserModel
from map_api.models.user_applied_layer import UserAppliedLayer as UserAppliedLayerModel
from map_api.models.user_favourite_folder import UserFavouriteFolder as UserFavouriteFolderModel
from map_api.models.user_favourite_layer import UserFavouriteLayer as UserFavouriteLayerModel
from map_api.models.user_layer import UserLayer as UserLayerModel
from map_api.utils.constant import DEFAULT_FOLDER_NAME, DEFAULT_LAYER_OPACITY, LAYER_SOURCE_BCDC


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

# A second identity, so ownership tests refuse a real user rather than a made up id.
SECOND_AUTH_GUID = '0f9e8d7c6b5a43210987654321fedcba@idir'
SECOND_IDIR_USERNAME = 'BJONES'

# The keycloak client a token is issued to, in the `azp` claim. In the shared
# EAO realm every EPIC application receives aud "account", so azp is what
# actually distinguishes them - which is why the API checks both.
TEST_CLIENT_ID = 'map-web'
TEST_SHARED_AUDIENCE = 'account'


def idir_claims(**overrides):
    """Return the claims an IDIR access token from the EAO realm carries.

    The shape matters more than the values: the API reads aud/azp to decide
    which application is calling, and groups to decide who may be here at all.
    Client roles in resource_access are deliberately not read - see
    UserService.get_permission_levels - but a real token still carries them, so
    one is included to keep the fixture honest.
    """
    now = int(time.time())
    claims = {
        'iss': CONFIG.JWT_OIDC_TEST_ISSUER,
        'aud': TEST_SHARED_AUDIENCE,
        'azp': TEST_CLIENT_ID,
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


def factory_user(auth_guid=TEST_AUTH_GUID, username=TEST_IDIR_USERNAME, **overrides):
    """Return a committed staff_users row."""
    user = UserModel(
        auth_guid=auth_guid,
        username=username,
        first_name=overrides.pop('first_name', 'Jane'),
        last_name=overrides.pop('last_name', 'Smith'),
        email_address=overrides.pop('email_address', 'jane.smith@gov.bc.ca'),
        **overrides,
    )
    user.save()
    return user


def bcdc_layer_payload(**overrides):
    """Return a valid POST body for a catalogue layer.

    Shared by applied layers and favourites: both reference a catalogue layer
    by the same identifiers, so there is one canonical payload.
    """
    payload = {
        'package_id': '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
        'object_name': 'WHSE_ADMIN_BOUNDARIES.CLAB_INDIAN_RESERVES',
        'display_name': 'Indian Reserves',
    }
    payload.update(overrides)
    return payload


def factory_applied_layer(user_id, **overrides):
    """Return a committed applied layer row for a user's map."""
    data = bcdc_layer_payload(**{
        k: overrides.pop(k)
        for k in ('package_id', 'object_name', 'display_name')
        if k in overrides
    })
    layer = UserAppliedLayerModel(
        user_id=user_id,
        source=overrides.pop('source', LAYER_SOURCE_BCDC),
        package_id=data['package_id'],
        object_name=data['object_name'],
        display_name=data['display_name'],
        opacity=overrides.pop('opacity', DEFAULT_LAYER_OPACITY),
        sort_order=overrides.pop(
            'sort_order', UserAppliedLayerModel.next_sort_order(user_id)
        ),
        **overrides,
    )
    layer.save()
    return layer


def factory_favourite_layer(user_id, **overrides):
    """Return a committed favourite layer row for a user."""
    data = bcdc_layer_payload(**{
        k: overrides.pop(k)
        for k in ('package_id', 'object_name', 'display_name')
        if k in overrides
    })
    favourite = UserFavouriteLayerModel(
        user_id=user_id,
        source=overrides.pop('source', LAYER_SOURCE_BCDC),
        package_id=data['package_id'],
        object_name=data['object_name'],
        display_name=data['display_name'],
        sort_order=overrides.pop(
            'sort_order', UserFavouriteLayerModel.next_sort_order(user_id)
        ),
        **overrides,
    )
    favourite.save()
    return favourite


def factory_favourite_folder(user_id, **overrides):
    """Return a committed favourite folder row for a user."""
    folder = UserFavouriteFolderModel(
        user_id=user_id,
        name=overrides.pop('name', DEFAULT_FOLDER_NAME),
        is_collapsed=overrides.pop('is_collapsed', False),
        sort_order=overrides.pop(
            'sort_order', UserFavouriteFolderModel.next_sort_order(user_id)
        ),
        **overrides,
    )
    folder.save()
    return folder


def factory_user_layer(user_id, **overrides):
    """Return a committed imported layer row for a user, holding no features."""
    layer = UserLayerModel(
        id=overrides.pop('id', uuid.uuid4()),
        user_id=user_id,
        name=overrides.pop('name', 'Roads'),
        is_sensitive=overrides.pop('is_sensitive', False),
        source_format=overrides.pop('source_format', 'GeoJSON'),
        source_filename=overrides.pop('source_filename', 'roads.geojson'),
        geometry_type=overrides.pop('geometry_type', 'Line'),
        **overrides,
    )
    layer.save()
    return layer
