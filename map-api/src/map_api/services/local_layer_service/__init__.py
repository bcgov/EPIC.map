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

Most of the catalogue is a WMS raster the browser fetches without this API in
the path. A few layers cannot be reached that way and arrive as files instead.

The trade: a warehouse raster arrives symbolised and matches iMap by
construction, where a vector tile is drawn by the client - which is why the
.lyrx has to be translated, and why the style travels with the data.
"""

from typing import NamedTuple, Optional

from sqlalchemy import text

from map_api.models.db import db


class LocalLayer(NamedTuple):
    """A layer this application hosts, and where its rows live."""

    table: str
    mvt_layer: str
    # Repeated per feature per tile, so kept to what drawing and identifying
    # need: what the style matches on, and the key to ask for the rest.
    properties: tuple
    # The column a feature is addressed by, for the detail endpoint.
    key: str


# A registry rather than a pattern: the table name reaches SQL, so it must be
# one of ours by construction and not merely one that looks safe.
LOCAL_LAYERS = {
    'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP': LocalLayer(
        table='cache.pip_consultation_areas',
        mvt_layer='pip_consultation_areas',
        # No organization_type: 21 of 298 areas have contacts of more than
        # one type, so it describes a contact, not the area.
        properties=('cnsltn_area_guid', 'cnsltn_area_name', 'contact_count'),
        key='cnsltn_area_guid',
    ),
}

# Everything the ingest carried, which is no longer everything the extract
# holds: the contacts blob is cut down to the fields the popup draws, and
# LocalContactSchema whitelists them again before the response goes out.
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

# Integer units per tile side. 4096 is what every renderer assumes.
MVT_EXTENT = 4096

# How far outside the tile to include geometry. At eight units per screen
# pixel a 4px stroke is 32 units wide, and without this every tile seam draws
# as a visible line.
MVT_BUFFER = 64

# Below this, tiles use the simplified geometry: at z6 the full 1.5 million
# vertices are read only to be snapped onto the same integers.
GENERALIZED_BELOW_ZOOM = 9

# The deepest zoom tiles are generated for. Above it the client overzooms,
# which is indistinguishable at these stroke widths and the main lever on how
# much work a pan costs.
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

        Empty when the tile holds no features, which is most of the world.
        """
        # Coalesced, not switched: there is nothing useful to simplify a point
        # to, so a mixed layer's geom_generalized is null and swapping the
        # column wholesale would draw no points at all.
        geometry = (
            'coalesce(a.geom_generalized, a.geom)'
            if z < GENERALIZED_BELOW_ZOOM else 'a.geom'
        )
        properties = ', '.join(f'a.{name}' for name in layer.properties)

        # Interpolated from LOCAL_LAYERS above, never the request. The tile
        # address is bound.
        statement = text(f"""
            WITH bounds AS (
                SELECT ST_TileEnvelope(:z, :x, :y) AS env
            ),
            mvtgeom AS (
                SELECT ST_AsMVTGeom({geometry}, bounds.env,
                                    {MVT_EXTENT}, {MVT_BUFFER}, true) AS geom,
                       {properties}
                FROM {layer.table} a, bounds
                -- The full geometry even when the simplified copy is
                -- encoded: simplification never expands an envelope, and this
                -- is the column the GiST index is on.
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

        The tile carries only the style's fields plus this key, so this is how
        the panel gets from a boundary to the nation's contacts.
        """
        columns = ', '.join(DETAIL_COLUMNS)

        # The extent in degrees, which is what the client points the camera
        # with. Computed here rather than carried in the tile: a tile clips
        # geometry at its own edge, so a feature spanning several of them has no
        # extent the client could work out from what it was drawn.
        bounds = (
            'ARRAY['
            'ST_XMin(envelope), ST_YMin(envelope), '
            'ST_XMax(envelope), ST_YMax(envelope)'
            '] AS bounds'
        )

        # Interpolated from DETAIL_COLUMNS and the registry, never the request;
        # the key itself is bound.
        statement = text(f"""
            SELECT {columns}, {bounds}
            FROM (
                SELECT *, ST_Envelope(ST_Transform(geom, 4326)) AS envelope
                FROM {layer.table}
                WHERE {layer.key} = :feature_key
            ) AS feature
        """)

        row = db.session.execute(
            statement, {'feature_key': feature_key}
        ).mappings().first()

        return dict(row) if row else None

    @classmethod
    def last_loaded(cls, layer: 'LocalLayer', object_name: str):
        """Return when the rows this layer is serving were loaded, or None.

        The most recent run that actually replaced the stored extract, which is
        what "last updated" means to someone reading the panel. A run that found
        the delivery unchanged, or refused it, left the data where it was, so it
        is not what dates the layer - the history is kept for the operators, and
        this is the one line of it the map shows.

        Falls back to the rows' own `loaded_date` where no run is recorded: the
        ingest always writes its history, so that is data put there by hand, and
        dating it from the rows beats showing nothing.
        """
        recorded = db.session.execute(
            text("""
                SELECT loaded_date
                FROM cache.local_layer_loads
                WHERE object_name = :object_name AND status = 'loaded'
                ORDER BY loaded_date DESC
                LIMIT 1
            """),
            {'object_name': object_name},
        ).scalar()
        if recorded is not None:
            return recorded

        # Interpolated from the registry, never the request.
        return db.session.execute(
            text(f'SELECT max(loaded_date) FROM {layer.table}')
        ).scalar()

    @staticmethod
    def style(object_name: str) -> Optional[dict]:
        """Return the MapLibre style the ingest stored for this layer.

        An ordered list of specs, not one paint bag: a translucent polygon
        takes a fill and a line. None where rows loaded but no style did,
        which is a half-finished ingest rather than a missing layer.
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
        # Snake case: the schema renames the keys for the wire, and camelCase
        # here would have marshmallow drop the fields.
        return {
            'source': {
                'min_zoom': (style.get('source') or {}).get('minZoom'),
                # Ours, not the style document's.
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
