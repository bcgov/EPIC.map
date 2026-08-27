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
"""Exposes all of the resource endpoints mounted in Flask-Blueprint style.

Uses restplus namespaces to mount individual api endpoints into the service.

All services have 2 defaults sets of endpoints:
 - ops
 - meta
That are used to expose operational health information about the service, and meta information.
"""

import os

from flask import Blueprint

from map_api.config import PRODUCTION_LIKE_ENVIRONMENTS

from .apihelper import Api
from .ops import API as OPS_API
from .user import API as USER_API


__all__ = ("API_BLUEPRINT", "DOC_PATHS", "DOCS_ENABLED", "OPS_BLUEPRINT", "URL_PREFIX")

URL_PREFIX = "/api/"
API_BLUEPRINT = Blueprint("API", __name__, url_prefix=URL_PREFIX)

# Health checks live on their own blueprint outside the authenticated API surface,
# so probes reach /ops/healthz without a token and without the Bearer Auth
# security scheme being advertised against them.
OPS_BLUEPRINT = Blueprint("API_OPS", __name__, url_prefix="/ops")
API_OPS = Api(
    OPS_BLUEPRINT,
    title="Service OPS API",
    version="1.0",
    description="The Core API for the Reports System",
)

API_OPS.add_namespace(OPS_API, path="/")

authorizations = {
    "Bearer Auth": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": 'Add "Bearer " before your token',
    }
}

# Swagger UI and swagger.json expose the full endpoint/model map unauthenticated;
# keep them out of production and staging.
# NOTE: doc=False only drops the UI route - flask-restx keeps registering
# /swagger.json unless add_specs is also turned off, so both are needed to stop
# the spec being served.
DOCS_ENABLED = os.getenv("FLASK_ENV", "development") not in PRODUCTION_LIKE_ENVIRONMENTS

# The two doc routes, spelled the way request.path reports them, so the
# authentication hook can let them through where they are registered.
DOC_PATHS = frozenset({URL_PREFIX.rstrip("/"), f"{URL_PREFIX}swagger.json"})

API = Api(
    title="MAP API",
    version="1.0",
    description="The Core API for MAP",
    authorizations=authorizations,
    doc="/" if DOCS_ENABLED else False,
)
# The blueprint is bound via init_app rather than the Api constructor because
# Api.__init__ calls init_app(app) without forwarding **kwargs, and init_app
# resets add_specs to its True default - so passing add_specs to the constructor
# is silently discarded.
API.init_app(API_BLUEPRINT, add_specs=DOCS_ENABLED)

API.add_namespace(USER_API)
