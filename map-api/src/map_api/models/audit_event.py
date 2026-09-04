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
"""The append-only audit event record."""
from datetime import datetime

from .db import db


class AuditEvent(db.Model):  # pylint: disable=too-few-public-methods
    """One recorded API call.

    Deliberately NOT a BaseModel subclass. BaseModel carries updated_date,
    updated_by, save(), delete() and find_by_id(); inheriting it would put an
    UPDATE and a DELETE path on a table whose whole value is that rows are
    written once and never touched again.

    For the same reason this class defines no save, update or delete method.
    Rows are inserted through AuditService.record and by nothing else.
    """

    __tablename__ = 'audit_events'
    __table_args__ = {'schema': 'app'}

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    occurred_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Who. auth_guid is the stable "<guid>@idir" identifier; the username is
    # recorded alongside it because it is what a human reads, and it can be
    # reassigned - so it is a label, not a key.
    auth_guid = db.Column(db.String(100), nullable=True, index=True)
    idir_username = db.Column(db.String(100), nullable=True)

    # Which application the call came from, taken from the `azp` claim of the
    # verified token. Never null: 'unknown' is written when a request is somehow
    # recorded without a client, so a null here would mean a bug rather than
    # history.
    host_app = db.Column(
        db.String(100), nullable=False, server_default='unknown', index=True
    )

    # What.
    method = db.Column(db.String(10), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    status_code = db.Column(db.Integer, nullable=False)
