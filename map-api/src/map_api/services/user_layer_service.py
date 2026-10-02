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
"""Layers a user imports from a file of their own.

The widget parses the file and sends its features as gzipped GeoJSONSeq: one
WGS 84 feature per line. They are read a line at a time and inserted in
batches, so memory is bounded by a batch rather than by the file - the pod has
less memory than a large layer's GeoJSON. PostGIS repairs and reprojects each
geometry to BC Albers on the way in.

Nothing is committed until every feature has been read, so a refused file
leaves no layer behind.
"""
from __future__ import annotations

import gzip
import json
import zlib
from typing import IO, Iterator, Optional

from sqlalchemy import bindparam, cast, func, select, text
from sqlalchemy.dialects.postgresql import JSON, JSONB
from sqlalchemy.exc import DataError, IntegrityError, InternalError

from map_api.exceptions import BadRequestError, PayloadTooLargeError, ResourceExistsError, UnprocessableEntityError
from map_api.models import db
from map_api.models.user_layer import UserLayer
from map_api.models.user_layer_feature import UserLayerFeature
from map_api.utils.constant import (
    BC_EXTENT, MAX_USER_LAYER_FEATURE_BYTES, MAX_USER_LAYER_FEATURES, MAX_USER_LAYER_GEOJSON_BYTES,
    MAX_USER_LAYER_PROPERTIES_BYTES, USER_LAYER_INSERT_BATCH_BYTES, USER_LAYER_INSERT_BATCH_ROWS,
    USER_LAYER_OUTPUT_PRECISION, USER_LAYER_STORAGE_SRID, USER_LAYER_STREAM_BATCH_ROWS, USER_LAYER_STREAM_CHUNK_BYTES)


# The widget's one-word summary of each GeoJSON geometry type.
GEOMETRY_LABELS = {
    'Point': 'Point',
    'MultiPoint': 'Point',
    'LineString': 'Line',
    'MultiLineString': 'Line',
    'Polygon': 'Polygon',
    'MultiPolygon': 'Polygon',
    'GeometryCollection': 'Mixed',
}

# Z and M are dropped, since the column is 2D and a KML altitude means nothing
# on a flat map; the repair comes before the reprojection so it works on the
# coordinates the user drew. The geometry is read out of the line as it came,
# which spares re-encoding the heaviest part of every feature.
_INSERT_FEATURE = UserLayerFeature.__table__.insert().values(
    layer_id=bindparam('layer_id'),
    geom=func.ST_Transform(
        func.ST_MakeValid(
            func.ST_Force2D(
                func.ST_SetSRID(func.ST_GeomFromGeoJSON(cast(bindparam('feature'), JSON)['geometry']), 4326)
            )
        ),
        USER_LAYER_STORAGE_SRID,
    ),
    # Sent already serialised, since it was measured that way.
    properties=cast(bindparam('properties'), JSONB),
)


def layer_name_taken_message(name: str) -> str:
    """Say the name is taken, in the widget's words."""
    return f'You already have a layer named "{name}". Enter a different name.'


def _refuse_constant(name):
    raise ValueError(f'{name} is not a coordinate')


class _Bounds:
    """The extent of every position seen, checked as it grows."""

    def __init__(self):
        """Start empty."""
        self.west = self.south = float('inf')
        self.east = self.north = float('-inf')

    def visit(self, coordinates, number: int):
        """Walk a geometry's coordinates, refusing any that are not WGS 84.

        A run of positions is measured with min and max rather than one number
        at a time - a detailed layer has millions of them. A value that is not
        a number, or a position short of two, fails the comparison or the index
        and is refused the same way.
        """
        if not isinstance(coordinates, list) or not coordinates:
            raise BadRequestError(f'Feature {number} has coordinates that could not be read.')
        first = coordinates[0]
        try:
            if isinstance(first, list) and first and not isinstance(first[0], list):
                xs = [position[0] for position in coordinates]
                ys = [position[1] for position in coordinates]
            elif not isinstance(first, list):
                xs, ys = [coordinates[0]], [coordinates[1]]
            else:
                for inner in coordinates:
                    self.visit(inner, number)
                return
            west, east, south, north = min(xs), max(xs), min(ys), max(ys)
            if not (-180 <= west and east <= 180 and -90 <= south and north <= 90):
                raise BadRequestError(
                    f'Feature {number} has coordinates outside longitude and latitude.'
                )
        except (TypeError, IndexError) as exc:
            raise BadRequestError(f'Feature {number} has coordinates that could not be read.') from exc
        self.west, self.east = min(self.west, west), max(self.east, east)
        self.south, self.north = min(self.south, south), max(self.north, north)

    def touches_bc(self) -> bool:
        """Whether any part of the extent overlaps the province."""
        west, south, east, north = BC_EXTENT
        return self.west <= east and self.east >= west and self.south <= north and self.north >= south


def _without_nul(value):
    """Drop NULs from every string: jsonb cannot hold one, and some shapefile text pads with them."""
    if isinstance(value, str):
        return value.replace('\x00', '')
    if isinstance(value, dict):
        return {_without_nul(key): _without_nul(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_without_nul(inner) for inner in value]
    return value


def _visit_geometry(geometry: dict, bounds: _Bounds, number: int):
    if geometry.get('type') == 'GeometryCollection':
        inner = geometry.get('geometries')
        if not isinstance(inner, list):
            raise BadRequestError(f'Feature {number} has a geometry that could not be read.')
        for part in inner:
            if not isinstance(part, dict) or part.get('type') not in GEOMETRY_LABELS:
                raise BadRequestError(f'Feature {number} has a geometry that could not be read.')
            _visit_geometry(part, bounds, number)
    else:
        bounds.visit(geometry.get('coordinates'), number)


def _read_lines(stream: IO[bytes]) -> Iterator[tuple[int, bytes]]:
    """Yield each non-blank line of the gzipped upload with its 1-based number.

    Both caps are checked as the file inflates, so an oversized upload is
    refused before it is all in memory rather than after.
    """
    total = 0
    number = 0
    try:
        with gzip.GzipFile(fileobj=stream, mode='rb') as lines:
            while True:
                line = lines.readline(MAX_USER_LAYER_FEATURE_BYTES + 1)
                if not line:
                    return
                number += 1
                total += len(line)
                if total > MAX_USER_LAYER_GEOJSON_BYTES:
                    raise PayloadTooLargeError(
                        f'This layer is larger than '
                        f'{MAX_USER_LAYER_GEOJSON_BYTES // (1024 * 1024)} MB of GeoJSON.'
                    )
                if len(line) > MAX_USER_LAYER_FEATURE_BYTES:
                    raise PayloadTooLargeError(
                        f'Feature {number} is larger than '
                        f'{MAX_USER_LAYER_FEATURE_BYTES // (1024 * 1024)} MB.'
                    )
                if line.strip():
                    yield number, line
    except (OSError, EOFError, zlib.error) as exc:
        raise BadRequestError('The features could not be unpacked. Upload the file again.') from exc


def _parse_feature(line: bytes, number: int, bounds: _Bounds) -> Optional[tuple[dict, str]]:
    """Return the insert parameters and geometry label, or None for no geometry.

    A feature without a geometry is dropped rather than refused: it has
    attributes but nothing to draw, which GeoJSON allows.
    """
    try:
        # NaN and Infinity are not JSON, though Python would read them.
        text_line = line.decode('utf-8')
        feature = json.loads(text_line, parse_constant=_refuse_constant)
    except (UnicodeDecodeError, ValueError) as exc:
        raise BadRequestError(f'Feature {number} is not valid JSON.') from exc

    if not isinstance(feature, dict) or feature.get('type') != 'Feature':
        raise BadRequestError(f'Line {number} is not a GeoJSON feature.')

    geometry = feature.get('geometry')
    if geometry is None:
        return None
    if not isinstance(geometry, dict) or geometry.get('type') not in GEOMETRY_LABELS:
        raise BadRequestError(f'Feature {number} has a geometry that could not be read.')
    _visit_geometry(geometry, bounds, number)

    properties = feature.get('properties')
    if properties is None:
        properties = {}
    elif not isinstance(properties, dict):
        raise BadRequestError(f'Feature {number} has properties that are not an object.')
    if b'\\u0000' in line:
        # Postgres will not parse a line holding one at all, so only the
        # geometry is sent and the attributes go without it.
        properties = _without_nul(properties)
        text_line = json.dumps({'geometry': geometry})
    serialised = json.dumps(properties)
    if len(serialised) > MAX_USER_LAYER_PROPERTIES_BYTES:
        raise PayloadTooLargeError(
            f'Feature {number} has more than '
            f'{MAX_USER_LAYER_PROPERTIES_BYTES // 1024} KB of attributes.'
        )

    return (
        {'feature': text_line, 'properties': serialised},
        GEOMETRY_LABELS[geometry['type']],
    )


class UserLayerService:
    """Imported layer management."""

    @classmethod
    def list_layers(cls, user_id: int) -> list:
        """Return this user's layers, newest first."""
        return UserLayer.find_by_user(user_id)

    @classmethod
    def get_layer(cls, layer_id, user_id: int) -> Optional[UserLayer]:
        """Return the layer, or None if it is not this user's."""
        return UserLayer.find_one_for_user(layer_id, user_id)

    @classmethod
    def import_layer(cls, layer_id, user_id: int, data: dict, features: IO[bytes]) -> tuple[UserLayer, bool]:
        """Store an imported layer and its features. Returns `(layer, created)`.

        The id is the client's, so a retry after a dropped connection is handed
        the layer the first attempt stored instead of a duplicate - `created`
        is False then, and the features sent again are not read.
        """
        existing = UserLayer.find_one_for_user(layer_id, user_id)
        if existing is not None:
            return existing, False
        if db.session.get(UserLayer, layer_id) is not None:
            raise ResourceExistsError('This layer id is already in use.')
        if UserLayer.name_taken(user_id, data['name']):
            raise ResourceExistsError(layer_name_taken_message(data['name']))

        layer = UserLayer(
            id=layer_id,
            user_id=user_id,
            name=data['name'],
            description=data.get('description'),
            is_sensitive=data['is_sensitive'],
            source_format=data['source_format'],
            source_filename=data['source_filename'],
            source_crs=data.get('source_crs'),
            # Placeholder until the features are counted; the constraint will
            # not take a null.
            geometry_type='Mixed',
        )
        try:
            db.session.add(layer)
            db.session.flush()
            cls._store_features(layer, features)
            db.session.commit()
        except IntegrityError as exc:
            db.session.rollback()
            # Lost a race with a second request for the same id or name.
            mine = UserLayer.find_one_for_user(layer_id, user_id)
            if mine is not None:
                return mine, False
            if UserLayer.name_taken(user_id, data['name']):
                raise ResourceExistsError(layer_name_taken_message(data['name'])) from exc
            raise
        except (DataError, InternalError) as exc:
            db.session.rollback()
            # PostGIS refused a geometry the checks above let through.
            raise BadRequestError('A feature has a geometry that could not be read.') from exc
        except Exception:  # noqa: B902 - rolled back and re-raised, never swallowed
            db.session.rollback()
            raise
        return layer, True

    @classmethod
    def _store_features(cls, layer: UserLayer, features: IO[bytes]):
        """Insert the features in batches, then summarise what was kept."""
        bounds = _Bounds()
        labels = set()
        batch, batch_bytes, count = [], 0, 0

        for number, line in _read_lines(features):
            parsed = _parse_feature(line, number, bounds)
            if parsed is None:
                continue
            params, label = parsed
            count += 1
            if count > MAX_USER_LAYER_FEATURES:
                raise UnprocessableEntityError(
                    f'This layer has more than {MAX_USER_LAYER_FEATURES:,} features. '
                    'Split it into smaller files.'
                )
            labels.add(label)
            params['layer_id'] = layer.id
            batch.append(params)
            batch_bytes += len(line)
            if len(batch) >= USER_LAYER_INSERT_BATCH_ROWS or batch_bytes >= USER_LAYER_INSERT_BATCH_BYTES:
                db.session.execute(_INSERT_FEATURE, batch)
                batch, batch_bytes = [], 0
        if batch:
            db.session.execute(_INSERT_FEATURE, batch)

        if count == 0:
            raise BadRequestError('This file holds no features to import.')
        if not bounds.touches_bc():
            raise UnprocessableEntityError('This layer lies entirely outside British Columbia.')

        # A repair can empty a geometry that had nothing to it, such as a
        # polygon with no area; there is nothing of those left to draw.
        emptied = db.session.execute(
            text('DELETE FROM user_layer_features WHERE layer_id = :layer_id AND ST_IsEmpty(geom)'),
            {'layer_id': layer.id},
        ).rowcount
        layer.feature_count = count - emptied
        if layer.feature_count == 0:
            raise BadRequestError('This file holds no features to import.')
        layer.geometry_type = labels.pop() if len(labels) == 1 else 'Mixed'
        layer.extent = func.ST_Envelope(func.ST_MakeLine(
            func.ST_SetSRID(func.ST_MakePoint(bounds.west, bounds.south), 4326),
            func.ST_SetSRID(func.ST_MakePoint(bounds.east, bounds.north), 4326),
        ))
        db.session.flush()
        # The extent was written as an expression; read back what it became.
        db.session.refresh(layer)

    @classmethod
    def feature_collection_chunks(cls, layer_id) -> Iterator[str]:
        """Yield the layer as a WGS 84 FeatureCollection, a few rows at a time.

        Postgres writes each feature's JSON, and rows are fetched in batches
        from a server-side cursor, so the whole layer is never held here.

        Takes the id rather than the layer: this runs while the response
        streams, after the request's session has been committed and discarded,
        and a model instance from that session can no longer be read.
        """
        feature_json = func.json_build_object(
            'type', 'Feature',
            'id', UserLayerFeature.id,
            'geometry', func.ST_AsGeoJSON(
                func.ST_Transform(UserLayerFeature.geom, 4326), USER_LAYER_OUTPUT_PRECISION
            ).cast(JSONB),
            'properties', UserLayerFeature.properties,
        )
        rows = db.session.execute(
            select(feature_json.cast(db.Text))
            .where(UserLayerFeature.layer_id == layer_id)
            .order_by(UserLayerFeature.id)
            .execution_options(yield_per=USER_LAYER_STREAM_BATCH_ROWS)
        ).scalars()

        chunk = ['{"type":"FeatureCollection","features":[']
        size = 0
        for index, row in enumerate(rows):
            chunk.append(row if index == 0 else ',' + row)
            size += len(row)
            if size >= USER_LAYER_STREAM_CHUNK_BYTES:
                yield ''.join(chunk)
                chunk, size = [], 0
        chunk.append(']}')
        yield ''.join(chunk)

    @classmethod
    def update_layer(cls, layer_id, user_id: int, data: dict) -> Optional[UserLayer]:
        """Change a layer's name, description or sensitivity. None if it is not this user's.

        Its own name does not count as taken, so a change of case goes through.
        """
        layer = UserLayer.find_one_for_user(layer_id, user_id)
        if layer is None:
            return None
        if 'name' in data and UserLayer.name_taken(user_id, data['name'], exclude_id=layer.id):
            raise ResourceExistsError(layer_name_taken_message(data['name']))

        for key in ('name', 'description', 'is_sensitive'):
            if key in data:
                setattr(layer, key, data[key])
        try:
            layer.save()
        except IntegrityError as exc:
            db.session.rollback()
            # Lost a race with another request taking the same name.
            raise ResourceExistsError(layer_name_taken_message(data['name'])) from exc
        return layer

    @classmethod
    def delete_layer(cls, layer_id, user_id: int) -> Optional[UserLayer]:
        """Delete a layer and its features, or return None if it is not this user's."""
        layer = UserLayer.find_one_for_user(layer_id, user_id)
        if layer is None:
            return None
        layer.delete()
        return layer
