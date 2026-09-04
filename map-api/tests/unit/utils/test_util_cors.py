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

"""Tests to assure the CORS utilities.

Test-Suite to ensure that the CORS decorator is working as expected.
"""
import pytest

from map_api.utils.util import allowedorigins, cors_preflight, parse_csv


TEST_CORS_METHODS_DATA = [
    ('GET'),
    ('PUT'),
    ('POST'),
    ('GET,PUT'),
    ('GET,POST'),
    ('PUT,POST'),
    ('GET,PUT,POST'),
]


@pytest.mark.parametrize('methods', TEST_CORS_METHODS_DATA)
def test_cors_preflight_post(methods):
    """Assert that the options methos is added to the class and that the correct access controls are set."""
    @cors_preflight(methods)  # pylint: disable=too-few-public-methods
    class TestCors():
        pass

    rv = TestCors().options()  # pylint: disable=no-member
    assert rv[2]['Access-Control-Allow-Origin'] == '*'
    assert rv[2]['Access-Control-Allow-Methods'] == methods


TEST_CORS_ORIGIN_DATA = [
    (None, []),
    ('', []),
    ('http://localhost:5173', ['http://localhost:5173']),
    (
        'http://localhost:5173,http://localhost:3000',
        ['http://localhost:5173', 'http://localhost:3000'],
    ),
    (
        ' http://localhost:5173 , http://localhost:3000 ',
        ['http://localhost:5173', 'http://localhost:3000'],
    ),
]


@pytest.mark.parametrize('cors_origin,expected', TEST_CORS_ORIGIN_DATA)
def test_allowedorigins(monkeypatch, cors_origin, expected):
    """Assert the origins are parsed, a single origin included."""
    if cors_origin is None:
        monkeypatch.delenv('CORS_ORIGIN', raising=False)
    else:
        monkeypatch.setenv('CORS_ORIGIN', cors_origin)

    assert allowedorigins() == expected


TEST_PARSE_CSV_DATA = [
    (None, []),
    ('', []),
    ('map-web', ['map-web']),
    ('compliance-web,submit-web', ['compliance-web', 'submit-web']),
    (' compliance-web , submit-web ', ['compliance-web', 'submit-web']),
    ('compliance-web,,submit-web,', ['compliance-web', 'submit-web']),
]


@pytest.mark.parametrize('value,expected', TEST_PARSE_CSV_DATA)
def test_parse_csv(value, expected):
    """Blank entries are dropped: in an allowlist they would be a hole."""
    assert parse_csv(value) == expected


def test_a_configured_origin_is_allowed(app, client):
    """The API answers browsers from the origins its environment names."""
    origin = app.config['CORS_ORIGINS'][0]

    response = client.get('/ops/healthz', headers={'Origin': origin})

    assert response.headers.get('Access-Control-Allow-Origin') == origin


def test_an_unconfigured_origin_is_not_allowed(client):
    """An origin outside the list gets no CORS header, so the browser blocks it."""
    response = client.get('/ops/healthz', headers={'Origin': 'https://evil.example'})

    assert 'Access-Control-Allow-Origin' not in response.headers


def test_credentials_are_not_enabled(app, client):
    """Callers send a bearer token, never a cookie.

    Advertising credentialed CORS would ask browsers to attach ambient cookies
    to cross-origin calls, which this API neither needs nor reads.
    """
    origin = app.config['CORS_ORIGINS'][0]

    response = client.get('/ops/healthz', headers={'Origin': origin})

    assert 'Access-Control-Allow-Credentials' not in response.headers
