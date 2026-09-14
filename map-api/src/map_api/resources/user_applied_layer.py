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
"""API endpoints for the layers a user has applied to the map."""

from http import HTTPStatus

from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.exceptions import ResourceNotFoundError
from map_api.schemas.user_applied_layer import (
    UserAppliedLayerRequestSchema, UserAppliedLayerSchema, UserAppliedLayerUpdateSchema)
from map_api.services.user_applied_layer_service import UserAppliedLayerService
from map_api.services.user_service import UserService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace(
    'applied-layers', description='Layers a user has applied to the map'
)

applied_layer_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserAppliedLayerSchema(), 'AppliedLayer'
)
applied_layer_request_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserAppliedLayerRequestSchema(), 'AppliedLayerRequest'
)
applied_layer_update_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserAppliedLayerUpdateSchema(), 'AppliedLayerUpdate'
)


@cors_preflight('GET, OPTIONS, POST')
@API.route('', methods=['GET', 'POST', 'OPTIONS'])
class AppliedLayers(Resource):
    """The layers the signed-in user currently has applied."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Fetch the layers the signed-in user has applied'
    )
    @API.response(code=200, model=[applied_layer_model], description='Success')
    def get():
        """Return the applied layers, bottom of the stack first."""
        user = UserService.current_user()
        layers = UserAppliedLayerService.list_layers(user.id)
        return UserAppliedLayerSchema(many=True).dump(layers), HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Apply a layer to the map')
    @API.expect(applied_layer_request_model)
    @API.response(code=201, model=applied_layer_model, description='Applied')
    @API.response(code=200, model=applied_layer_model, description='Already applied')
    @API.response(400, 'Bad Request')
    @API.response(422, 'Too many layers applied')
    def post():
        """Apply a layer to the map, or return the one already applied.

        201 the first time, 200 with the existing row after that.
        """
        payload = UserAppliedLayerRequestSchema().load(API.payload)
        user = UserService.current_user()
        layer, created = UserAppliedLayerService.apply_layer(user.id, payload)
        return (
            UserAppliedLayerSchema().dump(layer),
            HTTPStatus.CREATED if created else HTTPStatus.OK,
        )


@cors_preflight('OPTIONS, PATCH, DELETE')
@API.route('/<int:layer_id>', methods=['PATCH', 'DELETE', 'OPTIONS'])
@API.doc(params={'layer_id': 'The applied layer identifier'})
class AppliedLayer(Resource):
    """One applied layer."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Change an applied layer')
    @API.expect(applied_layer_update_model)
    @API.response(code=200, model=applied_layer_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'Not Found')
    def patch(layer_id):
        """Change the opacity of an applied layer."""
        payload = UserAppliedLayerUpdateSchema().load(API.payload)
        user = UserService.current_user()
        layer = UserAppliedLayerService.update_layer(layer_id, user.id, payload)
        if not layer:
            raise ResourceNotFoundError(f'Applied layer {layer_id} not found')
        return UserAppliedLayerSchema().dump(layer), HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Remove an applied layer')
    @API.response(code=204, description='Removed')
    def delete(layer_id):
        """Take a layer off the map. The row is deleted outright.

        Idempotent: 204 whether or not the row was there, so a retry or a
        second click is not an error, and a 204 tells the client nothing about
        whose layer an id belongs to.
        """
        user = UserService.current_user()
        UserAppliedLayerService.remove_layer(layer_id, user.id)
        return '', HTTPStatus.NO_CONTENT
