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

import os
import sys

import redis
from dotenv import find_dotenv, load_dotenv

# this will load all the envars from a .env file located in the project root (api)
load_dotenv(find_dotenv())

# Environment names that are treated as production-grade (strict config, no debug,
# no leaked stack traces). Kept as a single source of truth for get_named_config
# and for anything else (e.g. the swagger gating in resources) that needs the same check.
PRODUCTION_LIKE_ENVIRONMENTS = ('production', 'staging', 'default')


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

    SECRET_KEY = 'a secret'

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
    JWT_OIDC_AUDIENCE = os.getenv('JWT_OIDC_AUDIENCE', 'account')
    JWT_OIDC_CACHING_ENABLED = os.getenv('JWT_OIDC_CACHING_ENABLED', 'True')
    JWT_OIDC_JWKS_CACHE_TIMEOUT = 300
    # The keycloak client this API's tokens are issued to. Roles are read from
    # resource_access[<this client>] rather than from the realm, which is shared
    # with the other EPIC applications.
    JWT_OIDC_CLIENT_ID = os.getenv('JWT_OIDC_CLIENT_ID', 'epic-map')

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

    JWT_OIDC_TEST_MODE = True
    # JWT_OIDC_ISSUER = _get_config('JWT_OIDC_TEST_ISSUER')
    JWT_OIDC_TEST_AUDIENCE = os.getenv('JWT_OIDC_TEST_AUDIENCE')
    JWT_OIDC_TEST_CLIENT_SECRET = os.getenv('JWT_OIDC_TEST_CLIENT_SECRET')
    JWT_OIDC_TEST_ISSUER = os.getenv('JWT_OIDC_TEST_ISSUER')
    JWT_OIDC_WELL_KNOWN_CONFIG = os.getenv('JWT_OIDC_TEST_WELL_KNOWN_CONFIG')
    JWT_OIDC_TEST_ALGORITHMS = os.getenv('JWT_OIDC_TEST_ALGORITHMS')
    JWT_OIDC_TEST_JWKS_URI = os.getenv('JWT_OIDC_TEST_JWKS_URI', default=None)

    # Test-only keypair. The suite signs tokens with the private half and
    # flask-jwt-oidc verifies them against the public half, so the tests never
    # reach a real identity provider. Not used outside 'testing'.
    JWT_OIDC_TEST_KEYS = {
        "keys": [
            {
                "kid": "epic-map",
                "kty": "RSA",
                "alg": "RS256",
                "use": "sig",
                "n": "0myhfJEqlME4UAw4Gc0oe2XDjhWNbWeHv2jBVTiQUoPswKymRRugN7GU0oHXdZ_qsUEXX3HdXsi"
                     "ntWcWWqVrHZL48Ol3KN6IbM5HQSUZZRvm2f1gFxRjKlTS1xmpLxKGmNr97khvLh8ilDyJyJQTMf"
                     "bV9JtR88yyUBpJcAyVPwDZVEB_BG2q1iAKXWKHXWvHR0w3zKmWzOlhlG5H9L4xXjWcVjAKdjC4h"
                     "BsIUioyvX3xL9u4mlYjFI3jh5tZ0Ws6Ti1DE_ONZ9g0Z-8OLRJ7LWro1ofy4ueh4pJBfWGf9xBO"
                     "hpElpt4mA2CjJB8ZWRAdBXBnUi_YZTmTMPStcoXQRw",
                "e": "AQAB",
            }
        ]
    }

    JWT_OIDC_TEST_PRIVATE_KEY_JWKS = {
        "keys": [
            {
                "kid": "epic-map",
                "kty": "RSA",
                "alg": "RS256",
                "use": "sig",
                "n": "0myhfJEqlME4UAw4Gc0oe2XDjhWNbWeHv2jBVTiQUoPswKymRRugN7GU0oHXdZ_qsUEXX3HdXsi"
                     "ntWcWWqVrHZL48Ol3KN6IbM5HQSUZZRvm2f1gFxRjKlTS1xmpLxKGmNr97khvLh8ilDyJyJQTMf"
                     "bV9JtR88yyUBpJcAyVPwDZVEB_BG2q1iAKXWKHXWvHR0w3zKmWzOlhlG5H9L4xXjWcVjAKdjC4h"
                     "BsIUioyvX3xL9u4mlYjFI3jh5tZ0Ws6Ti1DE_ONZ9g0Z-8OLRJ7LWro1ofy4ueh4pJBfWGf9xBO"
                     "hpElpt4mA2CjJB8ZWRAdBXBnUi_YZTmTMPStcoXQRw",
                "e": "AQAB",
                "d": "WyNDujEhsTYSztDMB5jNHM0Rqtt42tbJe8TCX8fU8nhDNZxRk4MInLakT5x_FmoB-23G0sb9a00"
                     "bHj2c9_vHbhK3EZj8zE295updAEEyQ5GXJflRAg4JeU8t1o49sa6jb1cCPo9O4DoJ_wxNXPuNaM"
                     "mRF5WiJCcXYAxSnF5G0fchRnHXZ79ePaW2v6i-8YSb5nJSvaSt1Wdthkrk3W-8-ZMMtU9jfa1x0"
                     "x4ShWIP5YMX8dunIQzzb645ydaYLjLvlCJ7MVNaTO5FOai7kcPvS2FFapqry5sWOD4Jn85apztQ"
                     "g6e4GfJghHhRip7TO__50tIqf3XY4u0SBqrvACT8oQ",
                "p": "_kZx0MGBK9rWLue_zn2gyXvl1_Jv3VEFzC-z6PRZFOrDXEjSoAFdKtKmflFE6knKJ2Jbs-Tn51X"
                     "9lvJI1hmBHubVPCYHGdPUIUJoDuEqiNCdA05UWi9q1sexytsPiMYs75uhrLAoDeIbHG6C5XwAha"
                     "4bhl74rhoNI7XbbGOS7bc",
                "q": "09oJwWmCLEUEm2LhiHMaEJt7Eixkdeerv59K6i1rrqJ4aFO_Q1vqujbTrqJKq543nNgeb0BEGhk"
                     "wJ2zQsnJqCErH1vynz_lGPqLYOAwxPgu83vC8_GuG8z6yhcmB_EztlRgeJbIZweJUnVjm8W6oxy"
                     "SS1debDgol6ACIahfsMfE",
                "dp": "EHZZGg3dIgy5_zFr3p-NkF3gJJoCmg6L1ItmF3fyaINGgKwKTuens4UN2HHEh3Kdju00SLJSPU"
                      "z47RPkmU_vZyPEvG8t2IM5Yand-NClI1R2ReeFWI1nWl51aU_DcrR55k1qKzcAcN2pqa6R9O-R"
                      "TRZXm9x8NzFilmRIv3y234M",
                "dq": "X1gW4eQRQMlDHIexBw7-YREIn5I5GFNOmawgNCqC9xKJ7DIctz0L9Aiu1j6WKozHbKBbeihLPg"
                      "-t-2BewKD7lYXKULhe8hu3AIObmgXqt4ji1Nc1xsjB8IF8KPgatykMF_jFwKNaMkchW7tiHLB3"
                      "50BPkUw6rWPl0XdD7bOcipE",
                "qi": "4Q_qTHiIyxaKc2_m9XICSup1uYojQsMLR_DAGvMCKohZXSl9gCEikeNY2Ra6umy0EclhAWB9m0"
                      "Cu1XtLF7xLRakXJw6-mgnx9iU37COznQSZfhHw3Zd9dPYfJPixKn95nTUx3V4fUr4hEs2imtHn"
                      "_wFQT5TYh0DDeJ-weuJU1W0",
            }
        ]
    }

    JWT_OIDC_TEST_PRIVATE_KEY_PEM = """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDSbKF8kSqUwThQ
DDgZzSh7ZcOOFY1tZ4e/aMFVOJBSg+zArKZFG6A3sZTSgdd1n+qxQRdfcd1eyKe1
ZxZapWsdkvjw6Xco3ohszkdBJRllG+bZ/WAXFGMqVNLXGakvEoaY2v3uSG8uHyKU
PInIlBMx9tX0m1HzzLJQGklwDJU/ANlUQH8EbarWIApdYodda8dHTDfMqZbM6WGU
bkf0vjFeNZxWMAp2MLiEGwhSKjK9ffEv27iaViMUjeOHm1nRazpOLUMT841n2DRn
7w4tEnstaujWh/Li56HikkF9YZ/3EE6GkSWm3iYDYKMkHxlZEB0FcGdSL9hlOZMw
9K1yhdBHAgMBAAECggEAWyNDujEhsTYSztDMB5jNHM0Rqtt42tbJe8TCX8fU8nhD
NZxRk4MInLakT5x/FmoB+23G0sb9a00bHj2c9/vHbhK3EZj8zE295updAEEyQ5GX
JflRAg4JeU8t1o49sa6jb1cCPo9O4DoJ/wxNXPuNaMmRF5WiJCcXYAxSnF5G0fch
RnHXZ79ePaW2v6i+8YSb5nJSvaSt1Wdthkrk3W+8+ZMMtU9jfa1x0x4ShWIP5YMX
8dunIQzzb645ydaYLjLvlCJ7MVNaTO5FOai7kcPvS2FFapqry5sWOD4Jn85apztQ
g6e4GfJghHhRip7TO//50tIqf3XY4u0SBqrvACT8oQKBgQD+RnHQwYEr2tYu57/O
faDJe+XX8m/dUQXML7Po9FkU6sNcSNKgAV0q0qZ+UUTqSconYluz5OfnVf2W8kjW
GYEe5tU8JgcZ09QhQmgO4SqI0J0DTlRaL2rWx7HK2w+Ixizvm6GssCgN4hscboLl
fACFrhuGXviuGg0jtdtsY5LttwKBgQDT2gnBaYIsRQSbYuGIcxoQm3sSLGR156u/
n0rqLWuuonhoU79DW+q6NtOuokqrnjec2B5vQEQaGTAnbNCycmoISsfW/KfP+UY+
otg4DDE+C7ze8Lz8a4bzPrKFyYH8TO2VGB4lshnB4lSdWObxbqjHJJLV15sOCiXo
AIhqF+wx8QKBgBB2WRoN3SIMuf8xa96fjZBd4CSaApoOi9SLZhd38miDRoCsCk7n
p7OFDdhxxIdynY7tNEiyUj1M+O0T5JlP72cjxLxvLdiDOWGp3fjQpSNUdkXnhViN
Z1pedWlPw3K0eeZNais3AHDdqamukfTvkU0WV5vcfDcxYpZkSL98tt+DAoGAX1gW
4eQRQMlDHIexBw7+YREIn5I5GFNOmawgNCqC9xKJ7DIctz0L9Aiu1j6WKozHbKBb
eihLPg+t+2BewKD7lYXKULhe8hu3AIObmgXqt4ji1Nc1xsjB8IF8KPgatykMF/jF
wKNaMkchW7tiHLB350BPkUw6rWPl0XdD7bOcipECgYEA4Q/qTHiIyxaKc2/m9XIC
Sup1uYojQsMLR/DAGvMCKohZXSl9gCEikeNY2Ra6umy0EclhAWB9m0Cu1XtLF7xL
RakXJw6+mgnx9iU37COznQSZfhHw3Zd9dPYfJPixKn95nTUx3V4fUr4hEs2imtHn
/wFQT5TYh0DDeJ+weuJU1W0=
-----END PRIVATE KEY-----"""


class DockerConfig(_Config):  # pylint: disable=too-few-public-methods
    """In support of testing only.used by the py.test suite."""

    # POSTGRESQL
    DB_USER = os.getenv('DATABASE_DOCKER_USERNAME')
    DB_PASSWORD = os.getenv('DATABASE_DOCKER_PASSWORD')
    DB_NAME = os.getenv('DATABASE_DOCKER_NAME')
    DB_HOST = os.getenv('DATABASE_DOCKER_HOST')
    DB_PORT = os.getenv('DATABASE_DOCKER_PORT', '5432')
    SQLALCHEMY_DATABASE_URI = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{int(DB_PORT)}/{DB_NAME}'

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
