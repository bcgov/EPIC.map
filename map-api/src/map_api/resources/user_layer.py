# Copyright © 2026 Province of British Columbia
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
"""API endpoints for the layers a user imports from files of their own.

The client picks each layer's id, so an upload is a PUT: sending it again after
a dropped connection is answered with the layer already stored rather than a
second copy.
"""

import zlib
from http import HTTPStatus
from typing import Iterable, Iterator

from flask import Response, request, stream_with_context
from flask_restx import Namespace, Resource

from map_api.auth import auth
from map_api.exceptions import BadRequestError, ResourceNotFoundError
from map_api.schemas.user_layer import UserLayerImportSchema, UserLayerSchema
from map_api.services.user_layer_service import UserLayerService
from map_api.services.user_service import UserService
from map_api.utils.util import cors_preflight

from .apihelper import Api as ApiHelper


API = Namespace('imported-layers', description='Layers a user imports from their own files')

layer_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, UserLayerSchema(), 'ImportedLayer'
)

# The form field the features arrive in.
FEATURES_FIELD = 'features'


def _gzipped(chunks: Iterable[str]) -> Iterator[bytes]:
    """Gzip a streamed response as it goes out.

    GeoJSON shrinks about tenfold. The fastest level, since the pod has a
    fraction of a core.
    """
    compressor = zlib.compressobj(zlib.Z_BEST_SPEED, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
    for chunk in chunks:
        packed = compressor.compress(chunk.encode('utf-8'))
        if packed:
            yield packed
    yield compressor.flush()


@cors_preflight('GET, OPTIONS')
@API.route('', methods=['GET', 'OPTIONS'])
class ImportedLayers(Resource):
    """The layers the signed-in user has imported."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(
        API, endpoint_description="Fetch the signed-in user's imported layers"
    )
    @API.response(code=200, model=[layer_model], description='Success')
    def get():
        """Return the layers, newest first, without their features."""
        user = UserService.current_user()
        layers = UserLayerService.list_layers(user.id)
        return UserLayerSchema(many=True).dump(layers), HTTPStatus.OK


@cors_preflight('OPTIONS, PUT, DELETE')
@API.route('/<uuid:layer_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@API.doc(params={'layer_id': 'The layer identifier, chosen by the client'})
class ImportedLayer(Resource):
    """One imported layer."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Import a layer')
    @API.response(code=201, model=layer_model, description='Created')
    @API.response(code=200, model=layer_model, description='Already stored by an earlier attempt')
    @API.response(400, 'Bad Request')
    @API.response(409, 'Name already in use')
    @API.response(413, 'Too large')
    @API.response(422, 'Too many features, or outside British Columbia')
    def put(layer_id):
        """Store a layer from multipart form fields and a gzipped GeoJSONSeq file.

        The form carries name, description, is_sensitive, source_format,
        source_filename and source_crs; the `features` file holds one WGS 84
        GeoJSON feature per line, gzipped.
        """
        payload = UserLayerImportSchema().load(request.form.to_dict())
        features = request.files.get(FEATURES_FIELD)
        if features is None:
            raise BadRequestError(f'Send the features as a file named "{FEATURES_FIELD}".')

        user = UserService.current_user()
        layer, created = UserLayerService.import_layer(layer_id, user.id, payload, features.stream)
        return UserLayerSchema().dump(layer), HTTPStatus.CREATED if created else HTTPStatus.OK

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description='Delete an imported layer')
    @API.response(code=204, description='Removed')
    def delete(layer_id):
        """Delete a layer and its features.

        Idempotent: 204 whether or not the layer was there, so the widget can
        clean up after a cancelled upload without knowing whether it landed.
        """
        user = UserService.current_user()
        UserLayerService.delete_layer(layer_id, user.id)
        return '', HTTPStatus.NO_CONTENT


@cors_preflight('GET, OPTIONS')
@API.route('/<uuid:layer_id>/features', methods=['GET', 'OPTIONS'])
@API.doc(params={'layer_id': 'The layer identifier'})
class ImportedLayerFeatures(Resource):
    """The features of one imported layer."""

    @staticmethod
    @auth.require
    @ApiHelper.swagger_decorators(API, endpoint_description="Fetch an imported layer's features")
    @API.response(code=200, description='A GeoJSON FeatureCollection in WGS 84')
    @API.response(404, 'Not Found')
    def get(layer_id):
        """Stream the layer's features, in the order they were in the file."""
        user = UserService.current_user()
        layer = UserLayerService.get_layer(layer_id, user.id)
        if layer is None:
            raise ResourceNotFoundError(f'Layer {layer_id} not found')
        chunks = UserLayerService.feature_collection_chunks(layer.id)
        headers = {'Vary': 'Accept-Encoding'}
        if request.accept_encodings.quality('gzip') > 0:
            chunks = _gzipped(chunks)
            headers['Content-Encoding'] = 'gzip'
        return Response(stream_with_context(chunks), mimetype='application/geo+json', headers=headers)
