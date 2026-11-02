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
"""API endpoint for What's here."""

from http import HTTPStatus

from flask import request
from flask_restx import Namespace, Resource
from marshmallow import ValidationError

from map_api.auth import auth
from map_api.exceptions import BadRequestError
from map_api.schemas.whats_here import WhatsHereResultSchema, WhatsHereSchema
from map_api.services.user_service import UserService
from map_api.services.whats_here_service import WhatsHereService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace('whats-here', description="What the map's layers have under a selection")

whats_here_request_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, WhatsHereSchema(), 'WhatsHereRequest'
)

whats_here_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, WhatsHereResultSchema(), 'WhatsHere'
)


@cors_preflight('POST, OPTIONS')
@API.route('', methods=['POST', 'OPTIONS'])
class WhatsHere(Resource):
    """Features of the asked layers under a selection."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description='Search the layers on the map with a Select area selection',
    )
    @API.expect(whats_here_request_model)
    @API.response(code=200, model=whats_here_model, description='Success')
    @API.response(400, 'Bad Request')
    def post():
        """Return what each asked layer has under the selection. A POST because both are lists."""
        try:
            payload = WhatsHereSchema().load(request.get_json(silent=True) or {})
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        user = UserService.current_user()
        results = WhatsHereService.query(
            payload['selection'],
            payload['catalogue'],
            payload['hosted'],
            payload['imported'],
            user.id,
        )

        return WhatsHereResultSchema().dump({'results': results}), HTTPStatus.OK
