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
"""Tests for the EPIC.Track client."""
from unittest.mock import patch

import pytest
import requests

from map_api.exceptions import ServiceUnavailableError
from map_api.services.epic_track_service import FILTER_OPTIONS_KEY, PROJECTS_KEY, TrackService
from map_api.utils.cache import cache


TRACK_URL = 'https://track.example'
ISSUER = 'https://sso.example/auth/realms/eao-epic'
TOKEN_URL = f'{ISSUER}/protocol/openid-connect/token'

GET = 'map_api.services.epic_track_service.requests.get'
POST = 'map_api.services.epic_track_service.requests.post'


class _Response:
    def __init__(self, body=None, status_code=200):
        self._body = body
        self.status_code = status_code

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


def _token(access_token='service-token', expires_in=300):
    return _Response({'access_token': access_token, 'expires_in': expires_in})


def _project(project_id, **overrides):
    project = {
        'id': project_id,
        'name': f'Project {project_id}',
        'description': 'A project',
        'latitude': '53.0',
        'longitude': '-122.5',
        'is_project_closed': False,
        'ea_certificate': 'M23-01',
        'type': {'id': 8, 'name': 'Water Management'},
        'proponent': {'id': 1, 'name': 'EVR Operations Limited'},
        'region_env': {'id': 2, 'name': 'Cariboo'},
        'epic_guid': '5cd9b4b56a15600025df0cc8',
    }
    project.update(overrides)
    return project


def _work(project_id, work_state):
    return {'id': project_id * 10, 'project_id': project_id, 'work_state': work_state}


def _track(projects, works, phases=None):
    """Answer Track's GET endpoints, in place of requests.get. phases is keyed by work id."""
    def get(url, params=None, headers=None, timeout=None):  # pylint: disable=unused-argument
        if url == f'{TRACK_URL}/api/v1/projects':
            return _Response(projects)
        if url == f'{TRACK_URL}/api/v1/works':
            return _Response(works)
        if url.startswith(f'{TRACK_URL}/api/v1/works/') and url.endswith('/phases'):
            work_id = int(url.split('/')[-2])
            return _Response((phases or {}).get(work_id, []))
        raise AssertionError(f'unexpected url {url}')
    return get


@pytest.fixture(autouse=True)
def _configured(app, monkeypatch):
    monkeypatch.setitem(app.config, 'EPIC_TRACK_API_URL', TRACK_URL)
    monkeypatch.setitem(app.config, 'EPIC_TRACK_CLIENT_ID', 'epic-map-api')
    monkeypatch.setitem(app.config, 'EPIC_TRACK_CLIENT_SECRET', 'secret')
    monkeypatch.setitem(app.config, 'JWT_OIDC_ISSUER', ISSUER)
    with app.app_context():
        cache.clear()
        yield


def test_open_projects_are_returned_with_their_works_in_progress(app):
    """A closed project still appears; only IN_PROGRESS works make one green.

    is_active is what takes a project off the map. A closed one keeps its dot
    and its footprint, and the In-progress works filter is what narrows to the
    live ones.
    """
    projects = [
        _project(1),
        _project(2),
        _project(3, is_project_closed=True),
        _project(4),
    ]
    works = [
        _work(1, 'IN_PROGRESS'),
        _work(2, 'COMPLETED'),
        _work(3, 'IN_PROGRESS'),
        _work(4, 'SUSPENDED'),
    ]

    with patch(POST, return_value=_token()), patch(GET, side_effect=_track(projects, works)):
        result = TrackService.open_projects()

    assert [(p['id'], p['has_works_in_progress']) for p in result] == [
        (1, True), (2, False), (3, True), (4, False)
    ]
    assert result[0] == {
        'id': 1,
        'name': 'Project 1',
        'description': 'A project',
        'longitude': -122.5,
        'latitude': 53.0,
        'type_id': 8,
        'type_name': 'Water Management',
        'proponent_name': 'EVR Operations Limited',
        'region_id': 2,
        'region_name': 'Cariboo',
        'ea_certificate': 'M23-01',
        'certificate_issued': True,
        'has_works_in_progress': True,
        'epic_url': 'https://projects.eao.gov.bc.ca/p/5cd9b4b56a15600025df0cc8/project-details',
    }


@pytest.mark.parametrize(
    'latitude, longitude',
    [
        (None, '-122.5'),
        ('', '-122.5'),
        ('north', '-122.5'),
        ('95', '-122.5'),
        ('53', '-200'),
        ('0', '0'),
    ],
)
def test_projects_without_a_usable_location_are_left_off(app, latitude, longitude):
    """Track stores coordinates as free text, so anything unreadable is skipped."""
    projects = [_project(1), _project(2, latitude=latitude, longitude=longitude)]

    with patch(POST, return_value=_token()), patch(GET, side_effect=_track(projects, [])):
        result = TrackService.open_projects()

    assert [p['id'] for p in result] == [1]


def test_track_is_asked_with_a_service_account_token(app):
    """Client credentials from this API's own client, sent as a bearer token."""
    with patch(POST, return_value=_token('abc')) as post, \
            patch(GET, side_effect=_track([], [])) as get:
        TrackService.open_projects()

    post.assert_called_once()
    assert post.call_args.args[0] == TOKEN_URL
    assert post.call_args.kwargs['data'] == {
        'grant_type': 'client_credentials',
        'client_id': 'epic-map-api',
        'client_secret': 'secret',
    }
    calls = {call.args[0]: call.kwargs for call in get.call_args_list}
    assert calls[f'{TRACK_URL}/api/v1/projects']['params'] == {'is_active': 'true'}
    # No is_active on the works: a project is in progress when it has a work in
    # progress, and 19 of the IN_PROGRESS works are flagged inactive.
    assert calls[f'{TRACK_URL}/api/v1/works']['params'] == {'context': 'insights'}
    assert all(kwargs['headers'] == {'Authorization': 'Bearer abc'} for kwargs in calls.values())


def test_the_list_is_cached(app):
    """Track is asked once per cache period, however many requests arrive."""
    with patch(POST, return_value=_token()) as post, \
            patch(GET, side_effect=_track([_project(1)], [])) as get:
        TrackService.open_projects()
        TrackService.open_projects()
        TrackService.open_project(1)

    assert get.call_count == 2
    assert post.call_count == 1


def test_the_token_is_reused_until_it_expires(app):
    """A refresh after the list expires does not ask Keycloak again."""
    with patch(POST, return_value=_token()) as post, \
            patch(GET, side_effect=_track([], [])):
        TrackService.open_projects()
        cache.delete(PROJECTS_KEY)
        TrackService.open_projects()

    assert post.call_count == 1


def test_a_refused_token_is_replaced_once(app):
    """Track rejecting the token gets a fresh one rather than an outage."""
    answers = iter([_Response(status_code=401), _Response([_project(1)]), _Response([])])

    with patch(POST, side_effect=[_token('old'), _token('new')]) as post, \
            patch(GET, side_effect=lambda *a, **k: next(answers)) as get:
        result = TrackService.open_projects()

    assert [p['id'] for p in result] == [1]
    assert post.call_count == 2
    assert get.call_args_list[1].kwargs['headers'] == {'Authorization': 'Bearer new'}


@pytest.mark.parametrize(
    'failure',
    [
        {'side_effect': requests.ConnectionError('down')},
        {'return_value': _Response(status_code=500)},
        {'return_value': _Response(status_code=403)},
    ],
)
def test_track_failing_with_nothing_cached_is_unavailable(app, failure):
    """No list to fall back on is a 503, not an empty map."""
    with patch(POST, return_value=_token()), patch(GET, **failure):
        with pytest.raises(ServiceUnavailableError):
            TrackService.open_projects()


def test_track_failing_serves_the_last_list(app):
    """An outage after a good fetch keeps the dots on the map."""
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1)], [])):
        TrackService.open_projects()

    cache.delete(PROJECTS_KEY)
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=requests.ConnectionError('down')):
        result = TrackService.open_projects()

    assert [p['id'] for p in result] == [1]


def test_keycloak_failing_is_unavailable(app):
    """No token, no call to Track."""
    with patch(POST, side_effect=requests.ConnectionError('down')), patch(GET) as get:
        with pytest.raises(ServiceUnavailableError):
            TrackService.open_projects()

    get.assert_not_called()


@pytest.mark.parametrize('missing', ['EPIC_TRACK_API_URL', 'EPIC_TRACK_CLIENT_ID', 'EPIC_TRACK_CLIENT_SECRET'])
def test_an_unconfigured_api_asks_nobody(app, monkeypatch, missing):
    """Missing configuration is a 503 without any outbound call."""
    monkeypatch.setitem(app.config, missing, '')

    with patch(POST) as post, patch(GET) as get:
        with pytest.raises(ServiceUnavailableError):
            TrackService.open_projects()

    post.assert_not_called()
    get.assert_not_called()


def test_an_inactive_work_still_makes_its_project_in_progress(app):
    """A project is in progress when it has a work in progress.

    The work's own is_active says whether Track still lists it, not whether the
    work is under way, and the two disagree on 19 of the 50 IN_PROGRESS works.
    """
    projects = [_project(1), _project(2)]
    works = [
        dict(_work(1, 'IN_PROGRESS'), is_active=False),
        dict(_work(2, 'COMPLETED'), is_active=True),
    ]

    with patch(POST, return_value=_token()), patch(GET, side_effect=_track(projects, works)):
        result = TrackService.open_projects()

    assert [(p['id'], p['has_works_in_progress']) for p in result] == [
        (1, True), (2, False),
    ]


def test_open_project_finds_one_or_none(app):
    """A project that is not on the map has no card.

    Unlocated rather than closed: a closed project keeps its dot, so having no
    usable location is what leaves one off the map now.
    """
    projects = [_project(1), _project(2, latitude=None, longitude=None)]

    with patch(POST, return_value=_token()), patch(GET, side_effect=_track(projects, [])):
        assert TrackService.open_project(1)['id'] == 1
        assert TrackService.open_project(2) is None
        assert TrackService.open_project(99) is None


def _listed_work(work_id, project_id=1, **overrides):
    work = {
        'id': work_id,
        'project_id': project_id,
        'work_type': {'id': 5, 'name': 'Amendment'},
        'simple_title': 'Transmission line & work camp locations',
        'title': 'Project 1 - Amendment - Transmission line & work camp locations',
        'work_state': 'COMPLETED',
        'current_work_phase': {'id': 9, 'name': 'Decision', 'phase': {'name': 'Decision'}},
        'start_date': '2022-01-10T08:00:00+00:00',
        'decision_date': None,
        'work_decision_date': '2023-10-10T07:00:00+00:00',
        'epic_description': 'A project',
        'report_description': 'Proposes to raise the tailings facility.',
    }
    work.update(overrides)
    return work


def _track_with_listing(listing):
    """Answer Track's GETs, and the works listing POST alongside the token POST."""
    def post(url, data=None, json=None, headers=None, timeout=None):  # pylint: disable=unused-argument
        if url == TOKEN_URL:
            return _token()
        if url == f'{TRACK_URL}/api/v1/works/listing':
            return _Response({'items': listing, 'total': len(listing)})
        raise AssertionError(f'unexpected url {url}')
    return post


def test_project_works_are_listed_by_project_name(app):
    """One listing call filtered to the project, finished works included."""
    post = _track_with_listing([_listed_work(1)])
    with patch(POST, side_effect=post) as posted, \
            patch(GET, side_effect=_track([_project(1)], [])):
        works = TrackService.project_works(1)

    listing_call = [c for c in posted.call_args_list if c.args[0].endswith('/works/listing')][0]
    assert listing_call.kwargs['json'] == {
        'filters': [{'id': 'project.name', 'value': ['Project 1']}]
    }
    assert works == [{
        'id': 1,
        'title': 'Amendment - Transmission line & work camp locations',
        'state': 'COMPLETED',
        'phase_name': 'Decision',
        'start_date': '2022-01-10T08:00:00+00:00',
        'decision_date': '2023-10-10T07:00:00+00:00',
        'description': 'Proposes to raise the tailings facility.',
        'decision': None,
    }]


def test_project_works_are_in_card_order(app):
    """In progress first (newest start first), then by decision date, newest first, undated last."""
    listing = [
        _listed_work(1, work_decision_date='2020-01-01T00:00:00+00:00'),
        _listed_work(2, work_state='IN_PROGRESS', work_decision_date=None,
                     start_date='2024-01-01T00:00:00+00:00'),
        _listed_work(3, work_decision_date=None),
        _listed_work(4, work_state='TERMINATED', work_decision_date='2023-06-01T00:00:00-07:00'),
        _listed_work(5, work_state='IN_PROGRESS', work_decision_date=None,
                     start_date='2025-03-01T00:00:00+00:00'),
        _listed_work(6, project_id=2),
    ]
    with patch(POST, side_effect=_track_with_listing(listing)), \
            patch(GET, side_effect=_track([_project(1)], [])):
        works = TrackService.project_works(1)

    assert [work['id'] for work in works] == [5, 2, 4, 1, 3]


def test_a_work_without_a_simple_title_or_report_description(app):
    """The title is the work type alone; the EPIC description stands in."""
    listing = [_listed_work(1, simple_title='', report_description='  ',
                            epic_description='Proposes to amend the project.',
                            current_work_phase={'name': None, 'phase': {'name': 'Early Engagement'}})]
    with patch(POST, side_effect=_track_with_listing(listing)), \
            patch(GET, side_effect=_track([_project(1)], [])):
        work = TrackService.project_works(1)[0]

    assert work['title'] == 'Amendment'
    assert work['description'] == 'Proposes to amend the project.'
    assert work['phase_name'] == 'Early Engagement'


def test_a_work_is_not_described_by_its_project(app):
    """Track fills epic_description with the project's blurb on 57 of the 141 works in dev."""
    listing = [_listed_work(1, report_description=None, epic_description='A project')]
    with patch(POST, side_effect=_track_with_listing(listing)), \
            patch(GET, side_effect=_track([_project(1, description='A project')], [])):
        work = TrackService.project_works(1)[0]

    assert work['description'] is None


def _phase(decision, decided_on):
    return {'decision_milestone': 'Amendment Decision', 'decision': decision,
            'decision_milestone_date': decided_on}


def test_a_decided_work_carries_its_latest_decision(app):
    """The outcome of the most recent decision milestone across the work's phases."""
    phases = {1: [
        _phase('Referred', '2023-01-05T08:00:00+00:00'),
        _phase('Amendment Granted', '2023-10-10T07:00:00+00:00'),
        _phase(None, None),
    ]}
    with patch(POST, side_effect=_track_with_listing([_listed_work(1)])), \
            patch(GET, side_effect=_track([_project(1)], [], phases)):
        work = TrackService.project_works(1)[0]

    assert work['decision'] == 'Amendment Granted'


def test_only_decided_works_ask_for_their_phases(app):
    """A work still under way has no decision to fetch."""
    listing = [_listed_work(1), _listed_work(2, work_state='IN_PROGRESS', work_decision_date=None)]
    with patch(POST, side_effect=_track_with_listing(listing)), \
            patch(GET, side_effect=_track([_project(1)], [])) as got:
        works = TrackService.project_works(1)

    assert [c.args[0] for c in got.call_args_list if c.args[0].endswith('/phases')] == [
        f'{TRACK_URL}/api/v1/works/1/phases'
    ]
    assert [work['decision'] for work in works] == [None, None]


def test_a_failed_phases_call_leaves_the_work_without_a_decision(app):
    """The card still lists the work, with its date."""
    track = _track([_project(1)], [])

    def get(url, **kwargs):
        if url.endswith('/phases'):
            raise requests.ConnectionError('down')
        return track(url, **kwargs)

    with patch(POST, side_effect=_track_with_listing([_listed_work(1)])), patch(GET, side_effect=get):
        work = TrackService.project_works(1)[0]

    assert work['decision'] is None
    assert work['decision_date'] == '2023-10-10T07:00:00+00:00'


def test_project_works_are_cached(app):
    """Opening the same card again does not ask Track again."""
    with patch(POST, side_effect=_track_with_listing([_listed_work(1)])) as posted, \
            patch(GET, side_effect=_track([_project(1)], [])):
        TrackService.project_works(1)
        TrackService.project_works(1)

    assert len([c for c in posted.call_args_list if c.args[0].endswith('/works/listing')]) == 1


def test_works_of_an_absent_project_are_none(app):
    """No card, no works, and no listing call."""
    projects = [_project(2, latitude=None, longitude=None)]
    with patch(POST, side_effect=_track_with_listing([])) as posted, \
            patch(GET, side_effect=_track(projects, [])):
        assert TrackService.project_works(2) is None
        assert TrackService.project_works(99) is None

    assert not [c for c in posted.call_args_list if c.args[0].endswith('/works/listing')]


@pytest.mark.parametrize('epic_guid', [None, '', '   ', 'not-a-guid', '5cd9b4b56a15600025df0cc', '../admin', 42])
def test_a_project_without_a_usable_epic_guid_has_no_epic_url(app, epic_guid):
    """No link at all rather than a broken one."""
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1, epic_guid=epic_guid)], [])):
        project = TrackService.open_project(1)

    assert project['epic_url'] is None


def test_the_epic_url_follows_the_configured_site(app, monkeypatch):
    """Each environment can point at its own EPIC public site."""
    monkeypatch.setitem(app.config, 'EPIC_PUBLIC_URL', 'https://epic.example')
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1, epic_guid=' 5cd9b4b56a15600025df0cc8 ')], [])):
        project = TrackService.open_project(1)

    assert project['epic_url'] == 'https://epic.example/p/5cd9b4b56a15600025df0cc8/project-details'


@pytest.mark.parametrize('ea_certificate', [
    None, '', '   ', 42,
    # Track's certificate field doubles as a status on over a hundred of the
    # active projects in dev, misspellings included.
    'Withdrawn', 'Wtihdrawn', 'In progress', 'Terminated', 'N/A',
    'Certificate Refused', 'Not designated reviewable',
    # Near misses: a number is three parts, and nothing else.
    'M23', 'M2301', 'M231-01', 'EACM23-01', 'M23-01 amended', '23-01',
])
def test_a_project_whose_certificate_field_holds_no_number_has_none_issued(app, ea_certificate):
    """Anything but a certificate number leaves the card's tag and the Certified filter off."""
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1, ea_certificate=ea_certificate)], [])):
        project = TrackService.open_project(1)

    assert project['ea_certificate'] is None
    assert project['certificate_issued'] is False


@pytest.mark.parametrize('ea_certificate', [
    'M23-01', 'E96-01', 'X09-02',
    # Sector prefixes from the older numbering, all still in use in Track.
    'MD94-01', 'TD04-01', 'WD08-01', 'IND02-01',
    # Stored with the stray whitespace Track allows.
    ' M23-01 ',
])
def test_a_project_with_a_certificate_number_has_one_issued(app, ea_certificate):
    """The number is the tag's text, trimmed."""
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1, ea_certificate=ea_certificate)], [])):
        project = TrackService.open_project(1)

    assert project['ea_certificate'] == ea_certificate.strip()
    assert project['certificate_issued'] is True


def test_a_project_without_a_type_or_region_has_no_ids(app):
    """The filter bar treats a missing id as matching no option."""
    with patch(POST, return_value=_token()), \
            patch(GET, side_effect=_track([_project(1, type=None, region_env=None)], [])):
        project = TrackService.open_project(1)

    assert project['type_id'] is None
    assert project['region_id'] is None


def _code_tables(types, regions):
    """Answer Track's two code table endpoints, in place of requests.get."""
    def get(url, params=None, headers=None, timeout=None):  # pylint: disable=unused-argument
        if url == f'{TRACK_URL}/api/v1/project-types':
            return _Response(types)
        if url == f'{TRACK_URL}/api/v1/regions':
            assert params == {'type': 'ENV'}, f'unexpected params {params}'
            return _Response(regions)
        raise AssertionError(f'unexpected url {url}')
    return get


def test_filter_options_are_the_live_rows_by_name(app):
    """Retired rows are left out; what is left is ordered for the menu."""
    types = [
        {'id': 2, 'name': 'Water Management'},
        {'id': 1, 'name': 'Mines'},
        {'id': 3, 'name': 'Retired Type', 'is_active': False},
        {'id': 4, 'name': 'Deleted Type', 'is_deleted': True},
    ]
    regions = [{'id': 6, 'name': 'Skeena'}, {'id': 5, 'name': 'Cariboo'}]

    with patch(POST, return_value=_token()), patch(GET, _code_tables(types, regions)):
        with app.app_context():
            options = TrackService.filter_options()

    assert options == {
        'types': [{'id': 1, 'name': 'Mines'}, {'id': 2, 'name': 'Water Management'}],
        'regions': [{'id': 5, 'name': 'Cariboo'}, {'id': 6, 'name': 'Skeena'}],
    }


@pytest.mark.parametrize('row', [
    {'id': None, 'name': 'No id'},
    {'id': 9, 'name': ''},
    {'id': 9, 'name': '   '},
    {'id': 9},
])
def test_a_code_table_row_the_menu_cannot_draw_is_left_out(app, row):
    """An option needs both an id to filter on and a name to show."""
    with patch(POST, return_value=_token()), patch(GET, _code_tables([row], [])):
        with app.app_context():
            options = TrackService.filter_options()

    assert options == {'types': [], 'regions': []}


def test_filter_options_are_cached(app):
    """Track revises its code tables rarely, so it is asked once per period."""
    types = [{'id': 1, 'name': 'Mines'}]

    with patch(POST, return_value=_token()):
        with patch(GET, side_effect=_code_tables(types, [])) as get:
            with app.app_context():
                TrackService.filter_options()
                TrackService.filter_options()

    # One call per code table, not per request.
    assert get.call_count == 2


def test_filter_options_failing_with_nothing_cached_is_unavailable(app):
    """No code tables to fall back on is a 503, not two empty menus."""
    with patch(POST, return_value=_token()), patch(GET, return_value=_Response(None, 500)):
        with app.app_context():
            with pytest.raises(ServiceUnavailableError):
                TrackService.filter_options()


def test_filter_options_failing_serves_the_last_tables(app):
    """An outage after a good fetch keeps the menus populated.

    The gap this closes: the project list has its own last-good copy, so an
    outage used to leave dots on the map beside menus with nothing in them.
    """
    types = [{'id': 1, 'name': 'Mines'}]
    regions = [{'id': 5, 'name': 'Cariboo'}]
    with patch(POST, return_value=_token()), patch(GET, _code_tables(types, regions)):
        with app.app_context():
            TrackService.filter_options()

    with app.app_context():
        cache.delete(FILTER_OPTIONS_KEY)
        with patch(POST, return_value=_token()), patch(GET, return_value=_Response(None, 500)):
            options = TrackService.filter_options()

    assert options == {'types': [{'id': 1, 'name': 'Mines'}], 'regions': [{'id': 5, 'name': 'Cariboo'}]}


def test_the_second_code_table_failing_serves_the_last_tables(app):
    """Half an answer is not an answer: both tables come from the same fetch."""
    with patch(POST, return_value=_token()), \
            patch(GET, _code_tables([{'id': 1, 'name': 'Mines'}], [{'id': 5, 'name': 'Cariboo'}])):
        with app.app_context():
            TrackService.filter_options()

    def half(url, params=None, headers=None, timeout=None):  # pylint: disable=unused-argument
        if url == f'{TRACK_URL}/api/v1/project-types':
            return _Response([{'id': 2, 'name': 'Water Management'}])
        return _Response(None, 500)

    with app.app_context():
        cache.delete(FILTER_OPTIONS_KEY)
        with patch(POST, return_value=_token()), patch(GET, half):
            options = TrackService.filter_options()

    assert options == {'types': [{'id': 1, 'name': 'Mines'}], 'regions': [{'id': 5, 'name': 'Cariboo'}]}
