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
"""Tests for the common cache."""

from map_api.utils.cache import cache
from map_api.utils.constant import CACHE_ENTRY_LIMIT


# What flask-caching falls back to, and what this guards against inheriting.
FLASK_CACHING_DEFAULT_THRESHOLD = 500


def test_holds_more_than_the_library_default(app):
    """Entries past 500 survive.

    Nearest-feature answers alone can fill 500 - one per layer per quarter
    degree of map - and every eviction is another second of the warehouse's
    time on the next press.
    """
    assert CACHE_ENTRY_LIMIT > FLASK_CACHING_DEFAULT_THRESHOLD

    with app.app_context():
        cache.clear()
        written = FLASK_CACHING_DEFAULT_THRESHOLD + 100
        for index in range(written):
            cache.set(f'test:threshold:{index}', index, timeout=300)

        # The oldest is the first to go, so it is the one worth asking about.
        assert cache.get('test:threshold:0') == 0
        assert cache.get(f'test:threshold:{written - 1}') == written - 1
        cache.clear()
