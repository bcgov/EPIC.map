# Copyright © 2019 Province of British Columbia
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
"""Endpoints to check and manage the health of the service."""
from flask import current_app
from flask_restx import Namespace, Resource
from sqlalchemy import text

from map_api.config import get_redis_client
from map_api.models import db
from map_api.version import __version__


API = Namespace('OPS', description='Service - OPS checks')

SQL = text('select 1')

OK = 'ok'
ERROR = 'error'


def _check_database():
    """Return OK when the database answers a trivial query, ERROR otherwise.

    Broad except is deliberate: a health check reports a dependency as down, it
    never propagates that dependency's failure as a 500 from the probe itself.
    """
    try:
        db.session.execute(SQL)
        return OK
    except Exception as err:  # noqa: B902 # pylint: disable=broad-except
        # Leave the session usable for whatever handles the next request.
        db.session.rollback()
        current_app.logger.warning('healthz database check failed: %s', err)
        return ERROR


def _check_redis():
    """Return OK when Redis answers PING, ERROR otherwise.

    A fresh client per call means the check exercises resolve-connect-command
    rather than reporting on an already-warm socket. See _check_database for why
    the except is broad.
    """
    client = None
    try:
        client = get_redis_client()
        client.ping()
        return OK
    except Exception as err:  # noqa: B902 # pylint: disable=broad-except
        current_app.logger.warning('healthz redis check failed: %s', err)
        return ERROR
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:  # noqa: B902 # pylint: disable=broad-except
                pass


@API.route('healthz')
class Healthz(Resource):
    """Determines if the service and required dependencies are still working.

    This could be thought of as a heartbeat for the service.
    """

    @staticmethod
    def get():
        """Return a JSON object stating the health of the Service and dependencies.

        Every dependency is checked on every call - one failure never
        short-circuits the others, so the body always reports each dependency
        accurately. Any failure makes the whole response a 503; a 200 from this
        endpoint means everything below it is up.
        """
        checks = {
            'database': _check_database(),
            'redis': _check_redis(),
        }

        healthy = all(status == OK for status in checks.values())

        return {
            'message': 'api is healthy' if healthy else 'api is down',
            **checks,
            'version': __version__,
        }, (200 if healthy else 503)


@API.route('readyz')
class Readyz(Resource):
    """Determines if the service is ready to respond."""

    @staticmethod
    def get():
        """Return a JSON object that identifies if the service is setupAnd ready to work."""
        # TODO: add a poll to the DB when called
        return {'message': 'api is ready'}, 200
