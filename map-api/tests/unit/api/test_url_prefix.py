# Copyright © 2026 Province of British Columbia
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
"""Tests for the shape of the registered urls.

These read the url map rather than call anything, so none of them need a
database or a token.
"""
from map_api.resources import DOC_PATHS, URL_PREFIX


def registered_rules(app):
    """Return every url the application serves, as written in the url map."""
    return [str(rule) for rule in app.url_map.iter_rules()]


def test_no_route_has_an_empty_path_segment(app):
    """An empty segment means the prefixes were joined with two slashes.

    flask-restx joins its prefixes raw, so a trailing slash on URL_PREFIX
    registers '/api//users/me' - reachable only via a redirect, and wrong in
    every log line and on every swagger page.
    """
    assert [rule for rule in registered_rules(app) if '//' in rule] == []


def test_the_api_lives_directly_under_the_prefix(app):
    """A namespace mounted at the wrong depth would still answer, quietly."""
    api_rules = [
        rule for rule in registered_rules(app)
        if rule.startswith(f'{URL_PREFIX}/') and 'swaggerui' not in rule
    ]

    assert f'{URL_PREFIX}/users/me' in api_rules
    assert f'{URL_PREFIX}/users/me/favourites' in api_rules
    assert f'{URL_PREFIX}/users/me/layers' in api_rules


def test_the_doc_paths_name_routes_that_exist(app):
    """DOC_PATHS is what the sign-in gate lets through unauthenticated.

    It is built from URL_PREFIX by string surgery, so a prefix change can
    leave it naming a path nothing serves - which locks the docs behind a 401
    rather than failing loudly.
    """
    served = {rule.rstrip('/') or '/' for rule in registered_rules(app)}

    assert DOC_PATHS <= served
