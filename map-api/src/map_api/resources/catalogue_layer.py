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
"""API endpoints for reading catalogue layers out of the warehouse."""

from http import HTTPStatus

from flask import request
from flask_restx import Namespace, Resource
from marshmallow import ValidationError

from map_api.auth import auth
from map_api.exceptions import BadRequestError, ResourceNotFoundError
from map_api.schemas.catalogue_layer import (
    LayerMinZoomSchema, MetaDataQuerySchema, MetaDataSchema, NearestFeatureQuerySchema, NearestFeatureSchema,
    ObjectNameSchema)
from map_api.services.bcgw_service import BcgwService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace(
    'catalogue-layers', description='Catalogue layers as published by the BCGW'
)

nearest_feature_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, NearestFeatureSchema(), 'NearestFeature'
)

metadata_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, MetaDataSchema(), 'MetaData'
)

layer_min_zoom_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, LayerMinZoomSchema(), 'LayerMinZoom'
)


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/nearest-feature', methods=['GET', 'OPTIONS'])
class NearestFeature(Resource):
    """Where to point the camera to actually see a layer."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description=(
            'Bounds of the feature of this layer nearest a point, for the '
            'client to fit the map to'
        ),
    )
    @API.response(code=200, model=nearest_feature_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'The layer publishes no features')
    @API.response(503, 'The warehouse did not answer, or is already being asked')
    def get(object_name: str):
        """Return the bounds of the feature nearest `lon`/`lat`.

        The client sends the map centre, so a layer scattered across the
        province sends the user to the part of it they were already looking at.
        """
        try:
            ObjectNameSchema().load({'object_name': object_name})
            point = NearestFeatureQuerySchema().load(request.args)
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        bounds = BcgwService.nearest_feature_bounds(
            object_name, point['lon'], point['lat']
        )
        if bounds is None:
            raise ResourceNotFoundError(
                f'{object_name} publishes no features to zoom to.'
            )

        return NearestFeatureSchema().dump({'bounds': bounds}), HTTPStatus.OK


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/min-zoom', methods=['GET', 'OPTIONS'])
class LayerMinZoom(Resource):
    """The zoom below which a layer is not worth drawing."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description=(
            'Lowest map zoom at which openmaps draws this layer, for the '
            'client to gate the raster on'
        ),
    )
    @API.response(code=200, model=layer_min_zoom_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(503, 'The warehouse did not answer, or is already being asked')
    def get(object_name: str):
        """Return the layer's minimum drawing zoom, or null for no limit.

        Past its published scale the warehouse answers a tile request with a
        blank image rather than an error, so without this the client draws a
        layer that cannot appear and asks for a tile per pan to prove it.
        """
        try:
            ObjectNameSchema().load({'object_name': object_name})
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        min_zoom = BcgwService.layer_min_zoom(object_name)

        return (
            LayerMinZoomSchema().dump({'min_zoom': min_zoom}),
            HTTPStatus.OK,
        )


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/metadata', methods=['GET', 'OPTIONS'])
class MetaData(Resource):
    """What a layer has under a click on the map."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description=(
            'The feature of this layer intersecting a small box around a '
            'click, with its attributes'
        ),
    )
    @API.response(code=200, model=metadata_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(503, 'The warehouse did not answer')
    def get(object_name: str):
        """Return the feature under the click, or null when there is none.

        Nothing here is an answer rather than a missing resource, so it is a
        200: the client lists layers that failed apart from ones that are
        simply empty at the point.
        """
        try:
            ObjectNameSchema().load({'object_name': object_name})
            box = MetaDataQuerySchema().load(request.args)
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        feature = BcgwService.metadata(
            object_name, (box['west'], box['south'], box['east'], box['north'])
        )

        return MetaDataSchema().dump({'feature': feature}), HTTPStatus.OK
