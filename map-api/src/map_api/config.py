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
"""All of the configuration for the service is captured here.

All items are loaded,
or have Constants defined here that are loaded into the Flask configuration.
All modules and lookups get their configuration from the Flask config,
rather than reading environment variables directly or by accessing this configuration directly.
"""

import base64
import os
import sys
from functools import lru_cache

import redis
import rsa
from dotenv import find_dotenv, load_dotenv

from map_api.utils.util import parse_csv

# this will load all the envars from a .env file located in the project root (api)
load_dotenv(find_dotenv())

# Environment names that are treated as production-grade (strict config, no debug,
# no leaked stack traces). Kept as a single source of truth for get_named_config
# and for anything else (e.g. the swagger gating in resources) that needs the same check.
PRODUCTION_LIKE_ENVIRONMENTS = ('production', 'staging', 'default')

# Browser origins allowed to call this API when CORS_ORIGIN is not set. The API
# serves several EPIC applications, so this is a list of host origins per
# environment rather than the single front end it used to have. Deployed
# environments set CORS_ORIGIN explicitly; these are the local defaults.
LOCAL_CORS_ORIGINS = (
    'http://localhost:3000',    # map-web dev server (port pinned in vite.config.ts)
    'http://localhost:5173',    # vite default, used by the other EPIC dev servers
    'http://localhost:8000',
)

# Keycloak clients whose tokens this API accepts when ALLOWED_CLIENT_IDS is not
# set in a test run. Named here so the suite does not depend on a developer's
# .env - see ALLOWED_CLIENT_IDS on _Config for what this list means.
TEST_ALLOWED_CLIENT_IDS = ('compliance-web', 'submit-web', 'track-web', 'map-web')

# The kid the test suite stamps on the tokens it signs, matching the single key
# in the generated JWKS below.
TEST_JWT_KID = 'epic-map'

# Size of the throwaway keypair the test suite signs with. 1024 is deliberate:
# `rsa` generates in pure Python, where 2048 bits regularly costs ten seconds or
# more before the first test can run. The key is generated in memory, lives only
# for the run and guards nothing.
TEST_JWT_KEY_BITS = 1024


def _b64url_uint(value: int) -> str:
    """Encode an integer the way a JWK encodes one: big-endian, base64url, unpadded."""
    as_bytes = value.to_bytes((value.bit_length() + 7) // 8, 'big')
    return base64.urlsafe_b64encode(as_bytes).decode('utf-8').rstrip('=')


@lru_cache(maxsize=1)
def generate_test_jwt_keypair():
    """Return (private key PEM, public JWKS) for the tokens the test suite signs.

    Generated per process instead of being committed, so no private key material
    lives in the repository. Cached because a test run builds more than one
    TestConfig - the app's and the token factory's - and the half that signs has
    to belong to the same key as the half that verifies.
    """
    public_key, private_key = rsa.newkeys(TEST_JWT_KEY_BITS)
    public_jwks = {
        'keys': [
            {
                'kid': TEST_JWT_KID,
                'kty': 'RSA',
                'alg': 'RS256',
                'use': 'sig',
                'n': _b64url_uint(public_key.n),
                'e': _b64url_uint(public_key.e),
            }
        ]
    }
    return private_key.save_pkcs1().decode('utf-8'), public_jwks


def get_named_config(config_name: str = 'development'):
    """Return the configuration object based on the name.

    :raise: KeyError: if an unknown configuration is requested
    """
    if config_name in PRODUCTION_LIKE_ENVIRONMENTS:
        config = ProdConfig()
    elif config_name == 'testing':
        config = TestConfig()
    elif config_name == 'development':
        config = DevConfig()
    elif config_name == 'docker':
        config = DockerConfig()
    else:
        raise KeyError("Unknown configuration '{config_name}'")
    return config


def get_redis_client(config=None):
    """Return a Redis client built from the given (or the current) configuration.

    Mirrors how SQLALCHEMY_DATABASE_URI is consumed: the configuration owns the
    connection string and the caller builds a client from it. redis-py resolves
    and connects lazily, so this performs no I/O - the first command issued on
    the returned client opens the socket.
    """
    conf = config or get_named_config(os.getenv('FLASK_ENV', 'development'))
    return redis.Redis.from_url(conf.REDIS_URL, decode_responses=True)


class _Config():  # pylint: disable=too-few-public-methods
    """Base class configuration that should set reasonable defaults for all the other configurations."""

    PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

    # Overridden from the environment; ProdConfig refuses to fall back to this.
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-only-not-a-secret')

    TESTING = False
    DEBUG = False

    # POSTGRESQL
    DB_USER = os.getenv('DATABASE_USERNAME', '')
    DB_PASSWORD = os.getenv('DATABASE_PASSWORD', '')
    DB_NAME = os.getenv('DATABASE_NAME', '')
    DB_HOST = os.getenv('DATABASE_HOST', '')
    DB_PORT = os.getenv('DATABASE_PORT', '5432')
    SQLALCHEMY_DATABASE_URI = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{int(DB_PORT)}/{DB_NAME}'
    SQLALCHEMY_ECHO = True
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # REDIS
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = os.getenv('REDIS_PORT', '6379')
    REDIS_DB = os.getenv('REDIS_DB', '0')
    # sample.env supplies REDIS_URL directly; when it is absent the URL is
    # composed from the parts above, the same way SQLALCHEMY_DATABASE_URI is.
    REDIS_URL = os.getenv('REDIS_URL') or f'redis://{REDIS_HOST}:{int(REDIS_PORT)}/{REDIS_DB}'

    # JWT_OIDC Settings
    JWT_OIDC_WELL_KNOWN_CONFIG = os.getenv('JWT_OIDC_WELL_KNOWN_CONFIG')
    JWT_OIDC_ALGORITHMS = os.getenv('JWT_OIDC_ALGORITHMS', 'RS256')
    JWT_OIDC_JWKS_URI = os.getenv('JWT_OIDC_JWKS_URI')
    JWT_OIDC_ISSUER = os.getenv('JWT_OIDC_ISSUER')
    # Kept as the fallback for ALLOWED_CLIENT_IDS below. It no longer drives the
    # audience check directly: python-jose can only compare `aud` against a
    # single string, and this API now serves several keycloak clients.
    JWT_OIDC_AUDIENCE = os.getenv('JWT_OIDC_AUDIENCE', 'account')
    JWT_OIDC_CACHING_ENABLED = os.getenv('JWT_OIDC_CACHING_ENABLED', 'True')
    JWT_OIDC_JWKS_CACHE_TIMEOUT = 300
    # The keycloak client this API's own tokens are issued to. Retained for
    # service-to-service use; it is no longer a source of authorization, because
    # client roles mean different things in each EPIC client - see
    # map_api.utils.token.is_allowed_client.
    JWT_OIDC_CLIENT_ID = os.getenv('JWT_OIDC_CLIENT_ID', 'epic-map')

    # The keycloak clients whose tokens this API accepts. Every EPIC application
    # that embeds the map has its own client in the shared EAO realm, and a token
    # names its client in `azp` (and sometimes in `aud`), so a single audience is
    # no longer enough:
    #
    #     ALLOWED_CLIENT_IDS=compliance-web,submit-web,track-web,map-web
    #
    # When the SSO team adds a dedicated scope for this API, this collapses back
    # to one entry (ALLOWED_CLIENT_IDS=epic-map-api) with no code change - the
    # check itself lives in one function, map_api.utils.token.is_allowed_client.
    #
    # Falls back to JWT_OIDC_AUDIENCE so an environment that has not been updated
    # keeps the single-audience behaviour it had before.
    ALLOWED_CLIENT_IDS = parse_csv(os.getenv('ALLOWED_CLIENT_IDS')) or [JWT_OIDC_AUDIENCE]

    # Browser origins allowed to call this API. Bearer tokens are used rather
    # than cookies, so credentialed CORS is deliberately not enabled - see
    # create_app.
    CORS_ORIGINS = parse_csv(os.getenv('CORS_ORIGIN'))

    # The keycloak group a token must carry to reach this API. Left unset until
    # the realm has a group for EPIC.map: while it is empty any valid IDIR token
    # from the realm is accepted, which includes staff who only work in the
    # other EPIC applications. Set it to 'MAP' once the group exists.
    AUTH_REQUIRED_GROUP = os.getenv('AUTH_REQUIRED_GROUP', '')

    # Service account details
    KEYCLOAK_BASE_URL = os.getenv('KEYCLOAK_BASE_URL')
    KEYCLOAK_REALMNAME = os.getenv('KEYCLOAK_REALMNAME', 'map')
    KEYCLOAK_SERVICE_ACCOUNT_ID = os.getenv('MET_ADMIN_CLIENT_ID')
    KEYCLOAK_SERVICE_ACCOUNT_SECRET = os.getenv('MET_ADMIN_CLIENT_SECRET')
    # TODO separate out clients for APIs and user management.
    # TODO API client wont need user management roles in keycloak.
    KEYCLOAK_ADMIN_USERNAME = os.getenv('MET_ADMIN_CLIENT_ID')
    KEYCLOAK_ADMIN_SECRET = os.getenv('MET_ADMIN_CLIENT_SECRET')


class DevConfig(_Config):  # pylint: disable=too-few-public-methods
    """Dev Config."""

    TESTING = False
    DEBUG = True

    CORS_ORIGINS = parse_csv(os.getenv('CORS_ORIGIN')) or list(LOCAL_CORS_ORIGINS)
    print(f'SQLAlchemy URL (DevConfig): {_Config.SQLALCHEMY_DATABASE_URI}')


class TestConfig(_Config):  # pylint: disable=too-few-public-methods
    """In support of testing only.used by the py.test suite."""

    DEBUG = True
    TESTING = True
    DEBUG = True
    TESTING = True

    # POSTGRESQL
    DB_USER = os.getenv('DATABASE_TEST_USERNAME', 'postgres')
    DB_PASSWORD = os.getenv('DATABASE_TEST_PASSWORD', 'postgres')
    DB_NAME = os.getenv('DATABASE_TEST_NAME', 'testdb')
    DB_HOST = os.getenv('DATABASE_TEST_HOST', 'localhost')
    DB_PORT = os.getenv('DATABASE_TEST_PORT', '5432')
    SQLALCHEMY_DATABASE_URI = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{int(DB_PORT)}/{DB_NAME}'

    # REDIS - logical db 1 by default so a test run cannot clobber dev keys
    REDIS_HOST = os.getenv('REDIS_TEST_HOST', 'localhost')
    REDIS_PORT = os.getenv('REDIS_TEST_PORT', '6379')
    REDIS_DB = os.getenv('REDIS_TEST_DB', '1')
    REDIS_URL = os.getenv('REDIS_TEST_URL') or f'redis://{REDIS_HOST}:{int(REDIS_PORT)}/{REDIS_DB}'

    CORS_ORIGINS = parse_csv(os.getenv('CORS_ORIGIN')) or list(LOCAL_CORS_ORIGINS)

    # Fixed rather than env-driven, so the suite asserts the same thing on every
    # machine. A developer's .env cannot widen or narrow what the tests accept.
    ALLOWED_CLIENT_IDS = list(TEST_ALLOWED_CLIENT_IDS)

    JWT_OIDC_TEST_MODE = True
    # JWT_OIDC_ISSUER = _get_config('JWT_OIDC_TEST_ISSUER')
    JWT_OIDC_TEST_AUDIENCE = os.getenv('JWT_OIDC_TEST_AUDIENCE') or 'account'
    JWT_OIDC_TEST_CLIENT_SECRET = os.getenv('JWT_OIDC_TEST_CLIENT_SECRET')
    # Defaulted, not left to the environment: with no issuer configured
    # python-jose skips the issuer check entirely, which would quietly turn the
    # "token from another realm" test into one that proves nothing.
    JWT_OIDC_TEST_ISSUER = (
        os.getenv('JWT_OIDC_TEST_ISSUER') or 'http://localhost:8081/auth/realms/demo'
    )
    JWT_OIDC_WELL_KNOWN_CONFIG = os.getenv('JWT_OIDC_TEST_WELL_KNOWN_CONFIG')
    JWT_OIDC_TEST_ALGORITHMS = os.getenv('JWT_OIDC_TEST_ALGORITHMS')
    JWT_OIDC_TEST_JWKS_URI = os.getenv('JWT_OIDC_TEST_JWKS_URI', default=None)

    def __init__(self):
        """Generate this run's signing keypair.

        Set on the instance rather than as class attributes so that importing
        this module outside 'testing' never pays for key generation; Flask's
        config.from_object reads instance attributes just the same.
        """
        # Test-only keypair. The suite signs tokens with the private half and
        # flask-jwt-oidc verifies them against the public half, so the tests
        # never reach a real identity provider. Not used outside 'testing'.
        private_key_pem, public_jwks = generate_test_jwt_keypair()
        self.JWT_OIDC_TEST_PRIVATE_KEY_PEM = private_key_pem  # pylint: disable=invalid-name
        self.JWT_OIDC_TEST_KEYS = public_jwks  # pylint: disable=invalid-name


class DockerConfig(_Config):  # pylint: disable=too-few-public-methods
    """In support of testing only.used by the py.test suite."""

    # POSTGRESQL
    DB_USER = os.getenv('DATABASE_DOCKER_USERNAME')
    DB_PASSWORD = os.getenv('DATABASE_DOCKER_PASSWORD')
    DB_NAME = os.getenv('DATABASE_DOCKER_NAME')
    DB_HOST = os.getenv('DATABASE_DOCKER_HOST')
    DB_PORT = os.getenv('DATABASE_DOCKER_PORT', '5432')
    SQLALCHEMY_DATABASE_URI = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{int(DB_PORT)}/{DB_NAME}'

    CORS_ORIGINS = parse_csv(os.getenv('CORS_ORIGIN')) or list(LOCAL_CORS_ORIGINS)

    # REDIS - defaults to the compose service name, reachable on the compose network
    REDIS_HOST = os.getenv('REDIS_DOCKER_HOST', 'map-redis')
    REDIS_PORT = os.getenv('REDIS_DOCKER_PORT', '6379')
    REDIS_DB = os.getenv('REDIS_DOCKER_DB', '0')
    REDIS_URL = os.getenv('REDIS_DOCKER_URL') or f'redis://{REDIS_HOST}:{int(REDIS_PORT)}/{REDIS_DB}'

    print(f'SQLAlchemy URL (Docker): {SQLALCHEMY_DATABASE_URI}')


class ProdConfig(_Config):  # pylint: disable=too-few-public-methods
    """Production Config."""

    SECRET_KEY = os.getenv('SECRET_KEY', None)

    if not SECRET_KEY:
        SECRET_KEY = os.urandom(24)
        print('WARNING: SECRET_KEY being set as a one-shot', file=sys.stderr)

    TESTING = False
    DEBUG = False

    # No localhost fallback here: a deployed environment names every EPIC
    # application origin that may call it, or none are allowed.
    CORS_ORIGINS = parse_csv(os.getenv('CORS_ORIGIN'))

    if not CORS_ORIGINS:
        print('WARNING: CORS_ORIGIN is not set; browsers will be refused',
              file=sys.stderr)
