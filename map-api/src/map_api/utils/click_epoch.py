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
"""Which click a client is actually waiting on.

The browser aborts the requests of a click the user has moved on from, but a
sync WSGI worker does not learn that: it finds out the client has gone when it
writes the response, which is after the warehouse has been asked. So the client
says which click it is on instead, and the work checks.

This is the whole of the cancellation signal - a number per client, last one
wins. It is advisory: a missing or stale entry only means work that could have
been skipped is done anyway, which is what happens today.
"""
from typing import Optional

from map_api.utils.cache import cache
from map_api.utils.constant import METADATA_CLICK_TTL_SECONDS


def _key(client_id: str) -> str:
    """Cache key for one client's latest click."""
    return f'metadata:click:{client_id}'


def note_click(client_id: Optional[str], click_id: Optional[int]) -> None:
    """Record `click_id` as the latest this client has asked about.

    Kept as a maximum rather than a straight write so a request that overtakes
    an older one cannot move the mark backwards and un-supersede it.

    The read and the write are not one atomic step. Two clicks of the same
    client landing together can leave the lower one recorded, which costs the
    higher one its chance to be skipped - the same as not having this at all.
    Worth far less than a lock on every click.
    """
    if client_id is None or click_id is None:
        return

    latest = cache.get(_key(client_id))
    if latest is None or click_id > latest:
        cache.set(_key(client_id), click_id, timeout=METADATA_CLICK_TTL_SECONDS)


def is_superseded(client_id: Optional[str], click_id: Optional[int]) -> bool:
    """Whether this client has since clicked somewhere else.

    A client that sends no id is never superseded: it has not opted in to being
    interrupted, so its work runs as it always did.
    """
    if client_id is None or click_id is None:
        return False

    latest = cache.get(_key(client_id))
    return latest is not None and latest > click_id
