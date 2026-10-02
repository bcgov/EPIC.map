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
"""Vector tiles and styles for the layers this application hosts itself."""

from http import HTTPStatus

from flask import Response
from flask_restx import Namespace, Resource
from marshmallow import ValidationError

from map_api.auth import auth
from map_api.exceptions import BadRequestError, ResourceNotFoundError
from map_api.schemas.local_layer import (
    FeatureKeySchema, LocalLayerFeatureSchema, LocalLayerStyleSchema, LocalObjectNameSchema, TileAddressSchema)
from map_api.services.local_layer_service import LocalLayerService
from map_api.utils.constant import LOCAL_TILE_CACHE_SECONDS
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace(
    'local-layers', description='Layers hosted in this application, as vector tiles'
)

local_layer_style_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, LocalLayerStyleSchema(), 'LocalLayerStyle'
)

local_layer_feature_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, LocalLayerFeatureSchema(), 'LocalLayerFeature'
)

# What a Mapbox Vector Tile is served as. MapLibre does not check it, but a
# proxy deciding whether to compress does.
MVT_CONTENT_TYPE = 'application/vnd.mapbox-vector-tile'


def _registered_layer(object_name: str):
    """Return the layer `object_name` names, or raise a 404.

    Validated for shape and then looked up, rather than interpolated: the
    registry is what guarantees the table reaching SQL is one of ours.
    """
    try:
        LocalObjectNameSchema().load({'object_name': object_name})
    except ValidationError as exc:
        raise BadRequestError(str(exc.messages)) from exc

    layer = LocalLayerService.layer_for(object_name)
    if layer is None:
        raise ResourceNotFoundError(f'{object_name} is not hosted here.')
    return layer


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/tiles/<int:z>/<int:x>/<int:y>',
           methods=['GET', 'OPTIONS'])
class LocalLayerTile(Resource):
    """One vector tile of a layer we host."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description='A Mapbox Vector Tile for one tile address',
    )
    @API.response(code=200, description='A vector tile')
    @API.response(204, 'The tile holds no features')
    @API.response(400, 'Bad Request')
    @API.response(404, 'No such layer is hosted here')
    def get(object_name: str, z: int, x: int, y: int):
        """Return the tile at `z`/`x`/`y`, or 204 when it holds nothing.

        Empty is the common case - the layer covers British Columbia and the
        grid covers the world - so it answers 204 rather than 404, which
        MapLibre reads as an error and retries.
        """
        layer = _registered_layer(object_name)

        try:
            address = TileAddressSchema().load({'z': z, 'x': x, 'y': y})
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        # Outside the pyramid at this zoom. Checked here rather than in the
        # schema because the bound depends on z.
        side = 2 ** address['z']
        if address['x'] >= side or address['y'] >= side:
            raise BadRequestError(
                f"x and y must be below {side} at zoom {address['z']}."
            )

        tile = LocalLayerService.tile(
            layer, address['z'], address['x'], address['y']
        )
        if not tile:
            return Response(status=HTTPStatus.NO_CONTENT)

        response = Response(tile, mimetype=MVT_CONTENT_TYPE)
        # A tile is a copy of data that changes when someone reloads the extract,
        # which is to say rarely. Set here because the application's default is
        # no-store, which would have the browser refetch every tile on every pan.
        # Private because the response is authenticated.
        response.headers['Cache-Control'] = (
            f'private, max-age={LOCAL_TILE_CACHE_SECONDS}'
        )
        return response


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/style', methods=['GET', 'OPTIONS'])
class LocalLayerStyle(Resource):
    """How to draw a layer we host."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description=(
            'MapLibre paint and layout for this layer, translated from the '
            'ArcGIS style that came with it'
        ),
    )
    @API.response(code=200, model=local_layer_style_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'No such layer, or no style has been loaded for it')
    def get(object_name: str):
        """Return the layer's MapLibre style.

        The client cannot draw a vector layer without this, so a layer whose
        ingest loaded rows but no style is a 404 rather than an empty style
        that would paint every feature the same.
        """
        _registered_layer(object_name)

        style = LocalLayerService.style(object_name)
        if style is None:
            raise ResourceNotFoundError(
                f'No style has been loaded for {object_name}.'
            )

        return LocalLayerStyleSchema().dump(style), HTTPStatus.OK


@cors_preflight('GET, OPTIONS')
@API.route('/<string:object_name>/features/<string:feature_key>',
           methods=['GET', 'OPTIONS'])
class LocalLayerFeature(Resource):
    """One feature of a layer we host, in full."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API,
        endpoint_description=(
            'Everything recorded for one feature, including the contacts for '
            'the consultation area'
        ),
    )
    @API.response(code=200, model=local_layer_feature_model, description='Success')
    @API.response(400, 'Bad Request')
    @API.response(404, 'No such layer, or no such feature in it')
    def get(object_name: str, feature_key: str):
        """Return the full record behind one feature on the map.

        A vector tile carries only what the style matches on and the key to ask
        for the rest with, because everything in it is repeated for every
        feature in view. The contact details are the rest, and they are what
        somebody clicking a boundary actually wants.
        """
        layer = _registered_layer(object_name)

        try:
            FeatureKeySchema().load({'feature_key': feature_key})
        except ValidationError as exc:
            raise BadRequestError(str(exc.messages)) from exc

        feature = LocalLayerService.feature(layer, feature_key)
        if feature is None:
            raise ResourceNotFoundError(
                f'{object_name} has no feature {feature_key}.'
            )

        return LocalLayerFeatureSchema().dump(feature), HTTPStatus.OK
