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
"""API endpoints for the folders a user files their favourite layers into.

A folder holds no layers of its own in these responses: membership is the
`folder_id` on each favourite, so the client reads the two lists and groups
them, and one layer cannot appear under two folders.
"""

from http import HTTPStatus

from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.exceptions import ResourceNotFoundError
from map_api.schemas.user_favourite_folder import (
    UserFavouriteFolderRequestSchema, UserFavouriteFolderSchema, UserFavouriteFolderUpdateSchema)
from map_api.schemas.user_favourite_layer import UserFavouriteLayerSchema
from map_api.services.user_favourite_folder_service import UserFavouriteFolderService
from map_api.services.user_service import UserService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace(
    'favourite-folders', description='Folders a user files their favourites into'
)

folder_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteFolderSchema(), 'FavouriteFolder'
)
folder_request_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteFolderRequestSchema(), 'FavouriteFolderRequest'
)
folder_update_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteFolderUpdateSchema(), 'FavouriteFolderUpdate'
)
favourite_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserFavouriteLayerSchema(), 'UngroupedFavourite'
)


@cors_preflight('GET, OPTIONS, POST')
@API.route('', methods=['GET', 'POST', 'OPTIONS'])
class FavouriteFolders(Resource):
    """The folders the signed-in user has in their Favourites."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description="Fetch the signed-in user's favourite folders"
    )
    @API.response(code=200, model=[folder_model], description='Success')
    def get():
        """Return the folders, in the order they are shown in."""
        user = UserService.current_user()
        folders = UserFavouriteFolderService.list_folders(user.id)
        return UserFavouriteFolderSchema(many=True).dump(folders), HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Create a folder')
    @API.expect(folder_request_model)
    @API.response(code=201, model=folder_model, description='Created')
    @API.response(400, 'Bad Request')
    @API.response(422, 'Too many folders')
    def post():
        """Create a folder at the top of Favourites.

        The name is optional: a folder is created in edit mode and named after,
        so one committed without a name takes the default. Two folders may share
        a name, so this is always a new folder rather than the one already there.
        """
        payload = UserFavouriteFolderRequestSchema().load(API.payload or {})
        user = UserService.current_user()
        folder = UserFavouriteFolderService.create_folder(user.id, payload)
        return UserFavouriteFolderSchema().dump(folder), HTTPStatus.CREATED


@cors_preflight('OPTIONS, PATCH, DELETE')
@API.route('/<int:folder_id>', methods=['PATCH', 'DELETE', 'OPTIONS'])
@API.doc(params={'folder_id': 'The folder identifier'})
class FavouriteFolder(Resource):
    """One favourite folder."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Rename or collapse a folder')
    @API.expect(folder_update_model)
    @API.response(code=200, model=folder_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'Not Found')
    def patch(folder_id):
        """Rename a folder, collapse or expand it, or both.

        A name that is blank or only whitespace falls back to the default rather
        than being refused, so committing an empty field leaves a named folder.
        """
        payload = UserFavouriteFolderUpdateSchema().load(API.payload)
        user = UserService.current_user()
        folder = UserFavouriteFolderService.update_folder(folder_id, user.id, payload)
        if not folder:
            raise ResourceNotFoundError(f'Folder {folder_id} not found')
        return UserFavouriteFolderSchema().dump(folder), HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Delete a folder')
    @API.response(code=204, description='Removed')
    def delete(folder_id):
        """Delete a folder. Its layers stay favourited, at the top level.

        Idempotent: 204 whether or not the folder was there, so a retry or a
        second click is not an error, and a 204 tells the client nothing about
        whose folder an id belongs to.
        """
        user = UserService.current_user()
        UserFavouriteFolderService.delete_folder(folder_id, user.id)
        return '', HTTPStatus.NO_CONTENT


@cors_preflight('OPTIONS, POST')
@API.route('/<int:folder_id>/ungroup', methods=['POST', 'OPTIONS'])
@API.doc(params={'folder_id': 'The folder identifier'})
class FavouriteFolderUngroup(Resource):
    """Every layer in one folder, moved back out to the top level."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Move every layer in a folder to the top level'
    )
    @API.response(code=200, model=[favourite_model], description='Success')
    @API.response(404, 'Not Found')
    def post(folder_id):
        """Empty a folder without deleting it, and return the layers that moved.

        Nothing is un-favourited: the layers keep their order relative to each
        other and land below what is already at the top level.
        """
        user = UserService.current_user()
        favourites = UserFavouriteFolderService.ungroup_folder(folder_id, user.id)
        if favourites is None:
            raise ResourceNotFoundError(f'Folder {folder_id} not found')
        return UserFavouriteLayerSchema(many=True).dump(favourites), HTTPStatus.OK
