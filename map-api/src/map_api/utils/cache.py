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
"""Bring in the common cache.

In-process, so it is shared by every thread of a worker and by nothing else: a
second worker or a second pod keeps its own copy. That is enough while the API
runs one process, and the point at which it stops being enough - scaling out, or
wanting entries to outlive a rollout - is the point to put Redis behind it.
"""
from flask_caching import Cache

from map_api.utils.constant import CACHE_ENTRY_LIMIT


# lower case name as used by convention in most Flask apps
cache = Cache(  # pylint: disable=invalid-name
    config={'CACHE_TYPE': 'simple', 'CACHE_THRESHOLD': CACHE_ENTRY_LIMIT}
)
