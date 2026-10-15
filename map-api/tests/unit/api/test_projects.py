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
"""Tests for the project endpoints."""
from http import HTTPStatus
from unittest.mock import patch

from map_api.exceptions import ServiceUnavailableError
from tests.utilities.factory_utils import factory_auth_header


ENDPOINT = '/api/projects'
SERVICE = 'map_api.resources.project.TrackService'

PROJECT = {
    'id': 7,
    'name': 'Cariboo Gold Project',
    'description': 'An underground mine',
    'longitude': -121.5,
    'latitude': 53.1,
    'type_id': 1,
    'type_name': 'Mines',
    'proponent_name': 'EVR Operations Limited',
    'region_id': 2,
    'region_name': 'Cariboo',
    'ea_certificate': 'M23-01',
    'certificate_issued': True,
    'has_works_in_progress': True,
    'epic_url': 'https://projects.eao.gov.bc.ca/p/5cd9b4b56a15600025df0cc8/project-details',
}


def test_projects_require_a_token(app, client, session):
    """Track data is not open to anonymous callers."""
    assert client.get(ENDPOINT).status_code == HTTPStatus.UNAUTHORIZED
    assert client.get(f'{ENDPOINT}/7').status_code == HTTPStatus.UNAUTHORIZED


def test_projects_are_geojson_points(app, client, jwt, session):
    """Only what the dot needs travels with the list."""
    with patch(SERVICE) as service:
        service.open_projects.return_value = [PROJECT]
        response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json == {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'id': 7,
                'geometry': {'type': 'Point', 'coordinates': [-121.5, 53.1]},
                'properties': {
                    'id': 7,
                    'name': 'Cariboo Gold Project',
                    'typeId': 1,
                    'typeName': 'Mines',
                    'hasWorksInProgress': True,
                    'regionId': 2,
                    'certificateIssued': True,
                },
            }
        ],
    }


def test_one_project_is_its_card(app, client, jwt, session):
    """The card's fields, camel cased like the rest of the API."""
    with patch(SERVICE) as service:
        service.open_project.return_value = PROJECT
        response = client.get(f'{ENDPOINT}/7', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    service.open_project.assert_called_once_with(7)
    assert response.json == {
        'id': 7,
        'name': 'Cariboo Gold Project',
        'typeId': 1,
        'typeName': 'Mines',
        'hasWorksInProgress': True,
        'regionId': 2,
        'certificateIssued': True,
        'description': 'An underground mine',
        'proponentName': 'EVR Operations Limited',
        'regionName': 'Cariboo',
        'eaCertificate': 'M23-01',
        'longitude': -121.5,
        'latitude': 53.1,
        'epicUrl': 'https://projects.eao.gov.bc.ca/p/5cd9b4b56a15600025df0cc8/project-details',
    }


def test_a_closed_or_unknown_project_is_a_404(app, client, jwt, session):
    """Only open projects have a card."""
    with patch(SERVICE) as service:
        service.open_project.return_value = None
        response = client.get(f'{ENDPOINT}/8', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_track_unavailable_is_a_503(app, client, jwt, session):
    """The map can say Track is down rather than show an empty province."""
    with patch(SERVICE) as service:
        service.open_projects.side_effect = ServiceUnavailableError('EPIC.Track did not answer.')
        response = client.get(ENDPOINT, headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


def test_works_are_listed_for_the_card(app, client, jwt, session):
    """Camel cased, in the order the service returned them."""
    work = {
        'id': 3,
        'title': 'Amendment - Transmission line',
        'state': 'IN_PROGRESS',
        'phase_name': 'Amendment Review (Typical)',
        'start_date': '2024-01-01T00:00:00+00:00',
        'decision_date': None,
        'description': 'Proposes to amend.',
    }
    with patch(SERVICE) as service:
        service.project_works.return_value = [work]
        response = client.get(f'{ENDPOINT}/7/works', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    service.project_works.assert_called_once_with(7)
    assert response.json == [{
        'id': 3,
        'title': 'Amendment - Transmission line',
        'state': 'IN_PROGRESS',
        'phaseName': 'Amendment Review (Typical)',
        'decisionDate': None,
        'description': 'Proposes to amend.',
    }]


def test_works_of_a_closed_project_are_a_404(app, client, jwt, session):
    """Only open projects have works to show."""
    with patch(SERVICE) as service:
        service.project_works.return_value = None
        response = client.get(f'{ENDPOINT}/8/works', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_filter_options_require_a_token(app, client, session):
    """The code tables are not open to anonymous callers either."""
    assert client.get(f'{ENDPOINT}/filter-options').status_code == HTTPStatus.UNAUTHORIZED


def test_filter_options_are_the_two_code_tables(app, client, jwt, session):
    """Camel cased like the rest, in the order the service returned them."""
    with patch(SERVICE) as service:
        service.filter_options.return_value = {
            'types': [{'id': 1, 'name': 'Mines'}],
            'regions': [{'id': 2, 'name': 'Cariboo'}],
        }
        response = client.get(f'{ENDPOINT}/filter-options', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    assert response.json == {
        'types': [{'id': 1, 'name': 'Mines'}],
        'regions': [{'id': 2, 'name': 'Cariboo'}],
    }


# 'filter-options' is not an int, so it reaches its own route rather than the
# project-by-id one.
def test_filter_options_are_not_read_as_a_project_id(app, client, jwt, session):
    """The literal path wins over the <int:project_id> route."""
    with patch(SERVICE) as service:
        service.filter_options.return_value = {'types': [], 'regions': []}
        response = client.get(f'{ENDPOINT}/filter-options', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.OK
    service.open_project.assert_not_called()


def test_filter_options_unavailable_is_a_503(app, client, jwt, session):
    """Track being down is reported, not served as empty menus."""
    with patch(SERVICE) as service:
        service.filter_options.side_effect = ServiceUnavailableError('EPIC.Track did not answer.')
        response = client.get(f'{ENDPOINT}/filter-options', headers=factory_auth_header(jwt))

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
