# Copyright © 2026 Province of British Columbia
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
"""API endpoints for the layers a user has favourited."""

from http import HTTPStatus

from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.schemas.user_favourite_layer import (
    UserFavouriteLayerOrderSchema, UserFavouriteLayerRequestSchema, UserFavouriteLayerSchema)
from map_api.services.user_favourite_layer_service import UserFavouriteLayerService
from map_api.services.user_service import UserService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace(
    'favourites', description='Layers a user has favourited'
)

favourite_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteLayerSchema(), 'Favourite'
)
favourite_request_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteLayerRequestSchema(), 'FavouriteRequest'
)
favourite_order_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteLayerOrderSchema(), 'FavouriteOrder'
)


@cors_preflight('GET, OPTIONS, POST')
@API.route('', methods=['GET', 'POST', 'OPTIONS'])
class Favourites(Resource):
    """The layers the signed-in user has favourited."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Fetch the layers the signed-in user has favourited'
    )
    @API.response(code=200, model=[favourite_model], description='Success')
    def get():
        """Return the favourites, in the order the user put them in."""
        user = UserService.current_user()
        favourites = UserFavouriteLayerService.list_favourites(user.id)
        return UserFavouriteLayerSchema(many=True).dump(favourites), HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Favourite a layer')
    @API.expect(favourite_request_model)
    @API.response(code=201, model=favourite_model, description='Favourited')
    @API.response(code=200, model=favourite_model, description='Already favourited')
    @API.response(400, 'Bad Request')
    @API.response(422, 'Too many favourites')
    def post():
        """Favourite a layer, or return the one already favourited.

        201 the first time, 200 with the existing row after that.
        """
        payload = UserFavouriteLayerRequestSchema().load(API.payload)
        user = UserService.current_user()
        favourite, created = UserFavouriteLayerService.add_favourite(user.id, payload)
        return (
            UserFavouriteLayerSchema().dump(favourite),
            HTTPStatus.CREATED if created else HTTPStatus.OK,
        )


# Registered before the id route below. '/order' cannot be read as an int, so
# the converter keeps the two apart whatever order they are matched in.
@cors_preflight('OPTIONS, PUT')
@API.route('/order', methods=['PUT', 'OPTIONS'])
class FavouritesOrder(Resource):
    """The order the user's favourites are listed in."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Reorder the favourites')
    @API.expect(favourite_order_model)
    @API.response(code=200, model=[favourite_model], description='Success')
    @API.response(400, 'Bad Request')
    def put():
        """Put the favourites in the order given and return the whole list.

        The body carries every favourite id. The
        result does not depend on what the client sent before.
        """
        payload = UserFavouriteLayerOrderSchema().load(API.payload)
        user = UserService.current_user()
        favourites = UserFavouriteLayerService.reorder_favourites(
            user.id, payload['favourite_ids']
        )
        return UserFavouriteLayerSchema(many=True).dump(favourites), HTTPStatus.OK


@cors_preflight('OPTIONS, DELETE')
@API.route('/<int:favourite_id>', methods=['DELETE', 'OPTIONS'])
@API.doc(params={'favourite_id': 'The favourite identifier'})
class Favourite(Resource):
    """One favourite layer."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Un-favourite a layer')
    @API.response(code=204, description='Removed')
    def delete(favourite_id):
        """Un-favourite a layer. The row is deleted outright.

        Idempotent: 204 whether or not the row was there, so a retry or a
        second click is not an error.
        """
        user = UserService.current_user()
        UserFavouriteLayerService.remove_favourite(favourite_id, user.id)
        return '', HTTPStatus.NO_CONTENT
