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
"""EPIC.Track client, read with this API's own service account.

Open projects for the map, and the code tables its filter menus list. Track is
read live and cached briefly rather than copied: see claude-docs/06.
"""

import re
import threading
from datetime import datetime, timezone
from typing import Optional, Tuple

import requests
from flask import current_app

from map_api.exceptions import ServiceUnavailableError
from map_api.utils.cache import cache
from map_api.utils.constant import (
    EPIC_TRACK_CODE_TABLE_CACHE_TTL_SECONDS, EPIC_TRACK_PROJECTS_CACHE_TTL_SECONDS, EPIC_TRACK_REFRESH_WAIT_SECONDS,
    EPIC_TRACK_TIMEOUT_SECONDS, EPIC_TRACK_TOKEN_EXPIRY_MARGIN_SECONDS)


UNAVAILABLE_MESSAGE = 'EPIC.Track did not answer. Please try again.'

PROJECTS_KEY = 'epic-track:projects'
TOKEN_KEY = 'epic-track:token'
WORKS_KEY_PREFIX = 'epic-track:works:'
FILTER_OPTIONS_KEY = 'epic-track:filter-options'

# No expiry: during a Track outage the map keeps the last answer it had. Both of
# the map's own two reads have one, so an outage degrades them together - dots
# beside menus with nothing in them would be the map contradicting itself.
LAST_GOOD_PROJECTS_KEY = 'epic-track:projects:last-good'
LAST_GOOD_FILTER_OPTIONS_KEY = 'epic-track:filter-options:last-good'

WORK_IN_PROGRESS = 'IN_PROGRESS'

# Track keeps a region table per ministry. A project's `region_env` is the ENV
# one, and that is the id the map's Region menu filters on.
ENV_REGION_ENTITY = 'ENV'

# EPIC public project ids are Mongo ObjectIds; Track stores them as free text.
EPIC_GUID = re.compile(r'^[0-9a-fA-F]{24}$')

# An EA certificate number: one to three letters for the sector, the year, and a
# sequence - E12-03, M23-01, and the older WD08-01, IND02-01, MD94-01, TD04-01.
EA_CERTIFICATE = re.compile(r'^[A-Za-z]{1,3}\d{2}-\d{2}$')

# One refresh per process at a time; other requests wait for its answer.
REFRESH_LOCK = threading.Lock()


class TrackService:
    """Reads projects, works and code tables out of EPIC.Track's API."""

    @classmethod
    def open_projects(cls) -> list:
        """Return every open project that has a usable location."""
        projects = cache.get(PROJECTS_KEY)
        if projects is not None:
            return projects

        # pylint: disable-next=consider-using-with; `with` cannot time out
        if not REFRESH_LOCK.acquire(timeout=EPIC_TRACK_REFRESH_WAIT_SECONDS):
            return cls._last_good(LAST_GOOD_PROJECTS_KEY, 'project list')
        try:
            projects = cache.get(PROJECTS_KEY)
            if projects is not None:
                return projects
            try:
                projects = cls._fetch_open_projects()
            except ServiceUnavailableError:
                return cls._last_good(LAST_GOOD_PROJECTS_KEY, 'project list')
            cache.set(PROJECTS_KEY, projects, timeout=EPIC_TRACK_PROJECTS_CACHE_TTL_SECONDS)
            cache.set(LAST_GOOD_PROJECTS_KEY, projects, timeout=0)
            return projects
        finally:
            REFRESH_LOCK.release()

    @classmethod
    def open_project(cls, project_id: int) -> Optional[dict]:
        """Return one project the map draws, or None where it draws none.

        A closed project is still drawn; what leaves one off the map is
        is_active, or having no usable location.
        """
        return next(
            (project for project in cls.open_projects() if project['id'] == project_id),
            None,
        )

    @classmethod
    def project_works(cls, project_id: int) -> Optional[list]:
        """Return every work on one open project in card order, or None for no such project.

        In progress first, newest start first; then the rest by decision date, newest first.
        """
        project = cls.open_project(project_id)
        if project is None:
            return None

        key = f'{WORKS_KEY_PREFIX}{project_id}'
        works = cache.get(key)
        if works is not None:
            return works

        # The listing is the one Track endpoint that filters by project. Names are unique in
        # Track; the id check guards against a rename between refreshes.
        listing = cls._post(
            'works/listing',
            {'filters': [{'id': 'project.name', 'value': [project['name']]}]},
        )
        works = _sorted_works([
            _to_work(work, project.get('description'))
            for work in (listing or {}).get('items', [])
            if work.get('project_id') == project_id
        ])
        for work in works:
            work['decision'] = cls._decision(work)
        cache.set(key, works, timeout=EPIC_TRACK_PROJECTS_CACHE_TTL_SECONDS)
        return works

    @classmethod
    def _decision(cls, work: dict) -> Optional[str]:
        """Return the outcome of a decided work's latest decision milestone, e.g. Amendment Granted.

        Track keeps it on the milestone, not the work, so it costs one call per
        decided work. One that fails leaves its card the date without the outcome.
        """
        if not work['decision_date']:
            return None
        try:
            phases = cls._get(f"works/{work['id']}/phases", {})
        except ServiceUnavailableError:
            return None
        decided = [phase for phase in phases or [] if phase.get('decision')]
        if not decided:
            return None
        latest = max(decided, key=lambda phase: _when(phase.get('decision_milestone_date')))
        return latest['decision']

    @classmethod
    def filter_options(cls) -> dict:
        """Return the project type and ENV region code tables the menus list.

        No refresh lock, unlike the project list: a day-long cache means this is
        fetched about once per pod, so there is no repeated stampede to
        serialise. The last-good fallback it does share, and code tables earn one
        more easily than projects do - Track revises them rarely, so yesterday's
        menu is almost certainly still today's, and a menu is the one control the
        user has no way around when it is empty.
        """
        options = cache.get(FILTER_OPTIONS_KEY)
        if options is not None:
            return options

        try:
            options = {
                'types': _code_table(cls._get('project-types', {})),
                'regions': _code_table(cls._get('regions', {'type': ENV_REGION_ENTITY})),
            }
        except ServiceUnavailableError:
            return cls._last_good(LAST_GOOD_FILTER_OPTIONS_KEY, 'filter options')
        cache.set(FILTER_OPTIONS_KEY, options, timeout=EPIC_TRACK_CODE_TABLE_CACHE_TTL_SECONDS)
        cache.set(LAST_GOOD_FILTER_OPTIONS_KEY, options, timeout=0)
        return options

    @staticmethod
    def _last_good(key: str, what: str):
        """Serve the last answer Track gave, or report it unavailable."""
        last_good = cache.get(key)
        if last_good is None:
            raise ServiceUnavailableError(UNAVAILABLE_MESSAGE)
        current_app.logger.warning('Serving the last EPIC.Track %s.', what)
        return last_good

    @classmethod
    def _fetch_open_projects(cls) -> list:
        projects = cls._get('projects', {'is_active': 'true'})
        # Every work, not just the active ones: a project is in progress when
        # it has a work in progress, and the work's own is_active says whether
        # Track still lists it rather than whether the work is under way. 19 of
        # the 50 IN_PROGRESS works are is_active=false, covering 18 projects.
        #
        # context=insights is kept because it is what EPIC.Track's own insights
        # pages ask for; it makes no difference to what comes back.
        works = cls._get('works', {'context': 'insights'})

        in_progress = {
            work.get('project_id')
            for work in works
            if work.get('work_state') == WORK_IN_PROGRESS
        }

        open_projects = []
        unlocated = 0
        for project in projects:
            # is_project_closed is deliberately not a filter: a closed project
            # is still a project with a footprint worth drawing. `is_active`,
            # which the request above asks for, is what takes one off the map,
            # and the In-progress works filter is what narrows to live ones.
            location = _location(project)
            if location is None:
                unlocated += 1
                continue
            open_projects.append(_to_project(project, location, project['id'] in in_progress))

        if unlocated:
            current_app.logger.warning(
                'Left %s active EPIC.Track projects off the map: no usable location.',
                unlocated
            )
        return open_projects

    @classmethod
    def _get(cls, path: str, params: dict):
        return cls._call(requests.get, path, params=params)

    @classmethod
    def _post(cls, path: str, body: dict):
        return cls._call(requests.post, path, json=body)

    @classmethod
    def _call(cls, send, path: str, **kwargs):
        url = f"{current_app.config.get('EPIC_TRACK_API_URL')}/api/v1/{path}"
        response = None
        # A token Track refuses is dropped and replaced once.
        for _ in range(2):
            try:
                response = send(
                    url,
                    headers={'Authorization': f'Bearer {cls._token()}'},
                    timeout=EPIC_TRACK_TIMEOUT_SECONDS,
                    **kwargs,
                )
            except requests.RequestException as exc:
                current_app.logger.error('EPIC.Track %s failed: %s', path, exc)
                raise ServiceUnavailableError(UNAVAILABLE_MESSAGE) from exc
            if response.status_code != 401:
                break
            cache.delete(TOKEN_KEY)

        if response.status_code != 200:
            current_app.logger.error('EPIC.Track %s answered %s.', path, response.status_code)
            raise ServiceUnavailableError(UNAVAILABLE_MESSAGE)
        try:
            return response.json()
        except ValueError as exc:
            current_app.logger.error('EPIC.Track %s answered with something other than JSON.', path)
            raise ServiceUnavailableError(UNAVAILABLE_MESSAGE) from exc

    @staticmethod
    def _token() -> str:
        token = cache.get(TOKEN_KEY)
        if token:
            return token

        config = current_app.config
        issuer = (config.get('JWT_OIDC_ISSUER') or '').rstrip('/')
        client_id = config.get('EPIC_TRACK_CLIENT_ID')
        client_secret = config.get('EPIC_TRACK_CLIENT_SECRET')
        if not (issuer and client_id and client_secret and config.get('EPIC_TRACK_API_URL')):
            current_app.logger.error('EPIC.Track is not configured: set EPIC_TRACK_API_URL, '
                                     'EPIC_TRACK_CLIENT_ID and EPIC_TRACK_CLIENT_SECRET.')
            raise ServiceUnavailableError(UNAVAILABLE_MESSAGE)

        try:
            response = requests.post(
                f'{issuer}/protocol/openid-connect/token',
                data={
                    'grant_type': 'client_credentials',
                    'client_id': client_id,
                    'client_secret': client_secret,
                },
                timeout=EPIC_TRACK_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            body = response.json()
            token = body['access_token']
            expires_in = int(body.get('expires_in', 60))
        except (requests.RequestException, ValueError, KeyError) as exc:
            current_app.logger.error('Could not get a token for EPIC.Track: %s', exc)
            raise ServiceUnavailableError(UNAVAILABLE_MESSAGE) from exc

        cache.set(TOKEN_KEY, token, timeout=max(expires_in - EPIC_TRACK_TOKEN_EXPIRY_MARGIN_SECONDS, 1))
        return token


def _location(project: dict) -> Optional[tuple]:
    """Return (longitude, latitude), or None. Track stores both as free text."""
    try:
        latitude = float(project.get('latitude'))
        longitude = float(project.get('longitude'))
    except (TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    if latitude == 0 and longitude == 0:
        return None
    return longitude, latitude


def _offered(row) -> bool:
    """Whether Track still offers this code table row."""
    return (
        isinstance(row, dict) and
        row.get('is_active', True) and
        not row.get('is_deleted', False)
    )


def _code_table(rows) -> list:
    """One of Track's code tables as the menus list it: live rows, by name.

    Retired rows are left out rather than offered permanently at 0. A project
    can still carry a retired type or region, which is why the menu counts only
    the ids it actually offers - otherwise its "All" row would promise projects
    that selecting every option cannot reach.
    """
    options = [
        {'id': row.get('id'), 'name': (row.get('name') or '').strip()}
        for row in (rows or []) if _offered(row)
    ]
    return sorted(
        (option for option in options if option['id'] is not None and option['name']),
        key=lambda option: option['name'].casefold(),
    )


def _name_of(value) -> Optional[str]:
    return value.get('name') if isinstance(value, dict) else None


def _id_of(value) -> Optional[int]:
    return value.get('id') if isinstance(value, dict) else None


def _certificate(value) -> Tuple[Optional[str], Optional[str]]:
    """Split Track's certificate field into a number and a status.

    Track records the number as free text, and the field doubles as a status on
    over a hundred of the active projects in dev. Only a number is a
    certificate, so only a number earns the card's green tag and answers the
    filter bar's Certified toggle. Anything else is a factual outcome worth
    keeping - "Certificate Refused", "Withdrawn" - so it travels as the status
    the card shows in grey instead.
    """
    text = value.strip() if isinstance(value, str) else ''
    if not text:
        return None, None
    if EA_CERTIFICATE.match(text):
        return text, None
    return None, text


def _to_project(project: dict, location: tuple, has_works_in_progress: bool) -> dict:
    longitude, latitude = location
    certificate, certificate_status = _certificate(project.get('ea_certificate'))
    return {
        'id': project['id'],
        'name': project.get('name'),
        'description': project.get('description'),
        'longitude': longitude,
        'latitude': latitude,
        'type_id': _id_of(project.get('type')),
        'type_name': _name_of(project.get('type')),
        'proponent_name': _name_of(project.get('proponent')),
        'region_id': _id_of(project.get('region_env')),
        'region_name': _name_of(project.get('region_env')),
        'ea_certificate': certificate,
        'certificate_status': certificate_status,
        'certificate_issued': certificate is not None,
        'has_works_in_progress': has_works_in_progress,
        'epic_url': _epic_url(project.get('epic_guid')),
    }


def _epic_url(epic_guid) -> Optional[str]:
    """Return the project's page on the EPIC public site, or None rather than a broken link."""
    guid = (epic_guid or '').strip() if isinstance(epic_guid, str) else ''
    base = current_app.config.get('EPIC_PUBLIC_URL')
    if not base or not EPIC_GUID.match(guid):
        return None
    return f'{base}/p/{guid}/project-details'


def _work_description(work: dict, project_description: Optional[str]) -> Optional[str]:
    """Return the description of this work, never the project's.

    report_description is the one Track records per work. epic_description is
    the project's EPIC blurb on 57 of the 141 works in dev - the paragraph the
    card already shows above the list - so it only stands in where the work has
    no report description of its own, and never where it repeats the project's.
    """
    project_text = (project_description or '').strip()
    for value in (work.get('report_description'), work.get('epic_description')):
        description = (value or '').strip()
        if description and description != project_text:
            return description
    return None


def _to_work(work: dict, project_description: Optional[str]) -> dict:
    phase = work.get('current_work_phase') or {}
    title = ' - '.join(
        part for part in (_name_of(work.get('work_type')), (work.get('simple_title') or '').strip()) if part
    )
    return {
        'id': work.get('id'),
        'title': title or work.get('title'),
        # Track's own work_state, which is what Track's work pages show.
        'state': work.get('work_state'),
        'phase_name': phase.get('name') or _name_of(phase.get('phase')),
        'start_date': work.get('start_date'),
        'decision_date': work.get('work_decision_date') or work.get('decision_date'),
        'description': _work_description(work, project_description),
    }


_UNDATED = datetime.min.replace(tzinfo=timezone.utc)


def _when(value) -> datetime:
    """Parse one of Track's ISO timestamps; anything unreadable sorts last."""
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return _UNDATED
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _sorted_works(works: list) -> list:
    in_progress = [work for work in works if work['state'] == WORK_IN_PROGRESS]
    rest = [work for work in works if work['state'] != WORK_IN_PROGRESS]
    in_progress.sort(key=lambda work: _when(work['start_date']), reverse=True)
    rest.sort(key=lambda work: _when(work['decision_date']), reverse=True)
    return in_progress + rest
