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
"""API endpoints for managing an user resource."""

from http import HTTPStatus

from flask import g
from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.exceptions import ResourceNotFoundError
from map_api.schemas.user import CurrentUserSchema, UserSchema, UserUpdateSchema
from map_api.services.user_service import UserService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace('users', description='Endpoints for User Management')
"""Custom exception messages
"""

user_update_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserUpdateSchema(), 'UserUpdate'
)
user_list_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserSchema(), 'UserListItem'
)
current_user_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, CurrentUserSchema(), 'CurrentUser'
)


@cors_preflight('GET, OPTIONS')
@API.route('/me', methods=['GET', 'OPTIONS'])
class CurrentUser(Resource):
    """The signed-in user."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Fetch the signed in user and their permissions'
    )
    @API.response(code=200, model=current_user_model, description='Success')
    def get():
        """Return the signed-in user, provisioning their local profile if needed.

        The web client calls this once after a successful sign-in. Reaching
        here means the token has already been verified and the user's group
        membership checked, so the record is created on first sign-in rather
        than having to be seeded by an administrator beforehand.
        """
        token_info = g.token_info
        user = UserService.sync_user_from_token(token_info)
        permissions = UserService.get_permission_levels(token_info)
        setattr(user, 'permissions', [permission.value for permission in permissions])
        return CurrentUserSchema().dump(user), HTTPStatus.OK


@cors_preflight('OPTIONS, PATCH, DELETE')
@API.route('/<int:user_id>', methods=['PATCH', 'OPTIONS', 'DELETE'])
@API.doc(params={'user_id': 'The user identifier'})
class User(Resource):
    """The signed-in user's own record."""

    @staticmethod
    @ApiHelper.swagger_decorators(API, endpoint_description='Update the signed-in user')
    @API.expect(user_update_model)
    @API.response(code=200, model=user_list_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'Not Found')
    @auth.require
    def patch(user_id):
        """Update the signed-in user; anyone else's id is not found."""
        user_data = UserUpdateSchema().load(API.payload)
        updated_user = UserService.update_user(user_id, user_data)
        if not updated_user:
            raise ResourceNotFoundError(f'User with {user_id} not found')
        return UserSchema().dump(updated_user), HTTPStatus.OK

    @staticmethod
    @ApiHelper.swagger_decorators(API, endpoint_description='Delete the signed-in user')
    @API.response(code=200, model=user_list_model, description='Deleted')
    @API.response(404, 'Not Found')
    @auth.require
    def delete(user_id):
        """Delete the signed-in user; anyone else's id is not found."""
        deleted_user = UserService.delete_user(user_id)
        if not deleted_user:
            raise ResourceNotFoundError(f'User with {user_id} not found')
        return UserSchema().dump(deleted_user), HTTPStatus.OK
