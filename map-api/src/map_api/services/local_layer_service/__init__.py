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
"""Layers we host ourselves, served as vector tiles.

Most of the catalogue is drawn straight from the warehouse as WMS rasters, which
the browser fetches without this application in the path. A handful of layers
cannot be reached that way and reach us as files instead; those are loaded into
the cache schema and served from here.

The trade is worth naming: a warehouse raster arrives already symbolised, so it
matches iMap by construction. A vector tile is drawn by the client, which is why
the .lyrx has to be translated at all - and why the style travels with the data
rather than being written by hand.
"""

from typing import NamedTuple, Optional

from sqlalchemy import text

from map_api.models.db import db


class LocalLayer(NamedTuple):
    """A layer this application hosts, and where its rows live."""

    table: str
    mvt_layer: str
    # Carried into every tile, for every feature in view. Kept to what drawing
    # and identifying a feature needs - what the style matches on, and the key
    # to ask for the rest with - because this is repeated per feature per tile
    # and the rest of the record is an order of magnitude larger than the
    # geometry it would ride along with.
    properties: tuple
    # The column a feature is addressed by, for the detail endpoint.
    key: str


# Every layer served from here, by the object name the rest of the application
# knows it as. A registry rather than a pattern: the table name reaches SQL, so
# it must be one of ours by construction and not merely one that looks safe.
# schemas/layer_identity.py documents why identifiers rather than URLs are what
# this application stores, and this keeps that posture.
LOCAL_LAYERS = {
    'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP': LocalLayer(
        table='cache.pip_consultation_areas',
        mvt_layer='pip_consultation_areas',
        # No organization_type: 21 of the 298 areas have contacts of more than
        # one type, so it describes a contact rather than the area and there is
        # no single value to put on the feature.
        properties=('cnsltn_area_guid', 'cnsltn_area_name', 'contact_count'),
        key='cnsltn_area_guid',
    ),
}

# Columns the detail endpoint returns, which is everything the ingest carried.
# The contacts blob within it holds names, addresses, phone numbers, email
# addresses and both comment fields: the layer is reachable only with an IDIR
# token, which is the protection this data is required to have.
DETAIL_COLUMNS = (
    'cnsltn_area_guid',
    'cnsltn_area_name',
    'cnsltn_area_label',
    'cnsltn_area_mapsource',
    'cnsltn_area_verified_ind',
    'cnsltn_area_low_confidence_ind',
    'cnsltn_area_sensitivity',
    'cnsltn_area_asserted_agg_ind',
    'cnsltn_area_update_date',
    'contact_type',
    'feature_code',
    'feature_area_sqm',
    'feature_length_m',
    'contact_count',
    'contacts',
)

# Tile extent in integer units per side. 4096 is the convention every renderer
# assumes, and the buffer below is expressed in these units.
MVT_EXTENT = 4096

# How far outside the tile to include geometry. A 512px tile over 4096 units is
# eight units per screen pixel, so a 4px stroke is 32 units wide and half of it
# falls outside a tile whose polygon stops at the edge. Without this, every tile
# seam draws as a visible line across the map.
MVT_BUFFER = 64

# Below this, tiles are built from the simplified geometry. At z6 the province
# is a handful of tiles and the full 1.5 million vertices are read only to be
# snapped onto the same integers; by z9 the difference is visible.
GENERALIZED_BELOW_ZOOM = 9

# The deepest zoom a tile is generated for. Above it the client overzooms the
# last tile it has, which costs nothing and is indistinguishable at these
# stroke widths. This is the main lever on how much work a pan makes.
MAX_TILE_ZOOM = 12


class LocalLayerService:
    """Reads vector tiles and styles out of the cache schema."""

    @staticmethod
    def layer_for(object_name: str) -> Optional[LocalLayer]:
        """Return the layer registered under `object_name`, or None."""
        return LOCAL_LAYERS.get(object_name)

    @classmethod
    def tile(cls, layer: LocalLayer, z: int, x: int, y: int) -> bytes:
        """Build a Mapbox Vector Tile for one tile address.

        Empty when the tile holds no features, which is a legitimate answer
        rather than a failure - most of the world is not British Columbia.
        """
        # Coalesced rather than switched outright. A layer whose rows are all
        # polygons has a simplified copy of every one of them, but a mixed layer
        # will not: there is nothing useful to simplify a point to, so its
        # geom_generalized is null - and swapping the column wholesale would draw
        # no points at all below the threshold.
        geometry = (
            'coalesce(a.geom_generalized, a.geom)'
            if z < GENERALIZED_BELOW_ZOOM else 'a.geom'
        )
        properties = ', '.join(f'a.{name}' for name in layer.properties)

        # The table and column names are interpolated, which is safe only
        # because every one of them comes out of LOCAL_LAYERS above rather than
        # from the request. The tile address is bound.
        statement = text(f"""
            WITH bounds AS (
                SELECT ST_TileEnvelope(:z, :x, :y) AS env
            ),
            mvtgeom AS (
                SELECT ST_AsMVTGeom({geometry}, bounds.env,
                                    {MVT_EXTENT}, {MVT_BUFFER}, true) AS geom,
                       {properties}
                FROM {layer.table} a, bounds
                -- The full geometry, deliberately, even when the simplified
                -- copy is what gets encoded: SimplifyPreserveTopology never
                -- expands an envelope, so filtering on `geom` is conservative
                -- and is the column the GiST index is built on.
                WHERE a.geom && bounds.env
            )
            SELECT ST_AsMVT(mvtgeom.*, :mvt_layer, {MVT_EXTENT}, 'geom')
            FROM mvtgeom
            WHERE geom IS NOT NULL
        """)

        result = db.session.execute(
            statement, {'z': z, 'x': x, 'y': y, 'mvt_layer': layer.mvt_layer}
        ).scalar()

        # psycopg2 hands back a memoryview, which Flask will not serialise.
        return bytes(result) if result else b''

    @classmethod
    def feature(cls, layer: LocalLayer, feature_key: str) -> Optional[dict]:
        """Return one feature's full record, contacts and all.

        The tile carries only what the style matches on plus this key, so this
        is how the panel gets from a boundary on the map to the nation's contact
        details. None when nothing is stored under that key.
        """
        columns = ', '.join(DETAIL_COLUMNS)

        # Interpolated from DETAIL_COLUMNS and the registry, never the request;
        # the key itself is bound.
        statement = text(f"""
            SELECT {columns}
            FROM {layer.table}
            WHERE {layer.key} = :feature_key
        """)

        row = db.session.execute(
            statement, {'feature_key': feature_key}
        ).mappings().first()

        return dict(row) if row else None

    @staticmethod
    def style(object_name: str) -> Optional[dict]:
        """Return the MapLibre style the ingest stored for this layer.

        An ordered list of layer specs rather than one paint bag, because
        drawing a translucent polygon takes a fill and a line over the same
        tile and a point takes a circle. An outline-only layer is a list of one.

        None when the layer has rows but no style has been loaded for it, which
        is a half-finished ingest rather than a missing layer.
        """
        row = db.session.execute(
            text("""
                SELECT style, manifest
                FROM cache.local_layer_styles
                WHERE object_name = :object_name
            """),
            {'object_name': object_name},
        ).first()

        if row is None:
            return None

        style, manifest = row
        style = style or {}
        # Snake case, because the schema that dumps this is what renames the
        # keys for the wire. Returning camelCase here would have marshmallow
        # look for attributes that are not there and quietly drop the fields.
        return {
            'source': {
                'min_zoom': (style.get('source') or {}).get('minZoom'),
                # Not stored: it is this application's tiling decision rather
                # than anything the style document knows about.
                'max_zoom': MAX_TILE_ZOOM,
            },
            'layers': [
                {
                    'id': spec.get('id'),
                    'type': spec.get('type'),
                    'source_layer': spec.get('sourceLayer'),
                    'min_zoom': spec.get('minZoom'),
                    'filter': spec.get('filter'),
                    'layout': spec.get('layout') or {},
                    'paint': spec.get('paint') or {},
                }
                for spec in (style.get('layers') or [])
            ],
            'manifest': manifest,
        }
