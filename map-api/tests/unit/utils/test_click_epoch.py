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
"""Tests for which click a client is waiting on."""
import pytest

from map_api.utils.cache import cache
from map_api.utils.click_epoch import is_superseded, note_click


CLIENT = 'map-a'


@pytest.fixture(autouse=True)
def _forget_clicks(app):
    """Clear the click numbers; the cache is process wide and would outlive a test."""
    with app.app_context():
        cache.clear()
    yield


def test_a_click_nothing_has_followed_is_not_superseded(app):
    """The only click there has been is the one worth answering."""
    with app.app_context():
        note_click(CLIENT, 1)

        assert is_superseded(CLIENT, 1) is False


def test_a_newer_click_supersedes_an_older_one(app):
    """This is the whole of the signal: last click wins."""
    with app.app_context():
        note_click(CLIENT, 1)
        note_click(CLIENT, 2)

        assert is_superseded(CLIENT, 1) is True
        assert is_superseded(CLIENT, 2) is False


def test_an_overtaken_click_cannot_move_the_mark_backwards(app):
    """Kept as a maximum, so a late arrival cannot un-supersede what followed it."""
    with app.app_context():
        note_click(CLIENT, 5)
        note_click(CLIENT, 3)

        assert is_superseded(CLIENT, 3) is True
        assert is_superseded(CLIENT, 5) is False


def test_clients_do_not_supersede_each_other(app):
    """Two maps clicking at once are two conversations."""
    with app.app_context():
        note_click(CLIENT, 1)
        note_click('map-b', 99)

        assert is_superseded(CLIENT, 1) is False


@pytest.mark.parametrize(
    'client_id, click_id',
    [(None, 1), (CLIENT, None), (None, None)],
)
def test_a_client_that_says_nothing_is_never_superseded(app, client_id, click_id):
    """Sending a click number opts in; a client that does not is left alone."""
    with app.app_context():
        note_click('someone-else', 100)

        assert is_superseded(client_id, click_id) is False


def test_an_unknown_client_is_not_superseded(app):
    """A forgotten entry reads as 'nothing has followed', which is the safe way."""
    with app.app_context():
        assert is_superseded('never-seen', 1) is False
