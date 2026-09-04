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
"""Append-only audit event writes. Records are never updated or deleted."""
from map_api.models import db
from map_api.models.audit_event import AuditEvent
from map_api.utils import token as token_utils


class AuditService:  # pylint: disable=too-few-public-methods
    """Writes audit rows. Insert is the only operation this service offers."""

    @staticmethod
    def record(token_info, method: str, path: str, status_code: int) -> AuditEvent:
        """Insert one audit row for a request.

        host_app comes from the `azp` claim of the token the API has already
        verified. It is never taken from an Origin header or a custom header:
        those are set by the caller and can say anything, whereas azp is signed
        by Keycloak as part of the token.
        """
        event = AuditEvent(
            auth_guid=token_utils.auth_guid(token_info),
            idir_username=token_utils.idir_username(token_info),
            host_app=token_utils.host_app(token_info),
            method=method,
            path=path[:500],
            status_code=status_code,
        )
        db.session.add(event)
        db.session.commit()
        return event
