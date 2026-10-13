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
"""API endpoints for EPIC.Track projects shown on the map."""

from http import HTTPStatus

from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.exceptions import ResourceNotFoundError
from map_api.schemas.project import ProjectSchema, ProjectWorkSchema, to_feature_collection
from map_api.services.epic_track_service import TrackService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace('projects', description='EPIC.Track projects shown on the map')

project_model = ApiHelper.convert_ma_schema_to_restx_model(API, ProjectSchema(), 'Project')
work_model = ApiHelper.convert_ma_schema_to_restx_model(API, ProjectWorkSchema(), 'ProjectWork')


@cors_preflight('GET, OPTIONS')
@API.route('', methods=['GET', 'OPTIONS'])
class Projects(Resource):
    """Every open project, as points."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Open EPIC.Track projects as a GeoJSON FeatureCollection of points'
    )
    @API.response(200, 'Success')
    @API.response(503, 'EPIC.Track did not answer')
    def get():
        """Return open projects as GeoJSON."""
        return to_feature_collection(TrackService.open_projects()), HTTPStatus.OK


@cors_preflight('GET, OPTIONS')
@API.route('/<int:project_id>', methods=['GET', 'OPTIONS'])
class Project(Resource):
    """One open project, for its card."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='One open EPIC.Track project')
    @API.response(code=200, model=project_model, description='Success')
    @API.response(404, 'Not an open project')
    @API.response(503, 'EPIC.Track did not answer')
    def get(project_id: int):
        """Return one open project."""
        project = TrackService.open_project(project_id)
        if project is None:
            raise ResourceNotFoundError(f'Project {project_id} is not an open EPIC.Track project.')
        return ProjectSchema().dump(project), HTTPStatus.OK


@cors_preflight('GET, OPTIONS')
@API.route('/<int:project_id>/works', methods=['GET', 'OPTIONS'])
class ProjectWorks(Resource):
    """Every work on one open project, for its card."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description='Works on an open EPIC.Track project, in progress first'
    )
    @API.response(code=200, model=[work_model], description='Success')
    @API.response(404, 'Not an open project')
    @API.response(503, 'EPIC.Track did not answer')
    def get(project_id: int):
        """Return one open project's works."""
        works = TrackService.project_works(project_id)
        if works is None:
            raise ResourceNotFoundError(f'Project {project_id} is not an open EPIC.Track project.')
        return ProjectWorkSchema(many=True).dump(works), HTTPStatus.OK
