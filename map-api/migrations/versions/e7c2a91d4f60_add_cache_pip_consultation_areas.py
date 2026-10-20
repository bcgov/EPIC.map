"""add cache.pip_consultation_areas and cache.local_layer_styles

Revision ID: e7c2a91d4f60
Revises: f2a7c4e19b60
Create Date: 2026-09-23 00:00:00.000000

The first tenants of the cache schema: a copy of a BCGW layer we are given as
files, and the MapLibre translation of the style that came with it. Both
reloadable from the source extract, which is what the cache schema is for.

Raw SQL rather than geoalchemy2's Geometry type: geoalchemy2 is in
requirements/prod.txt but not the pinned requirements.txt the Dockerfile
installs, so importing it would upgrade on a laptop and fail on deploy.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e7c2a91d4f60'
# Re-pointed as this branch caught up with develop - twice now, as the layer
# detail columns took the parent this had. Two heads make `flask db upgrade`
# refuse. These tables share nothing with either, so the order is free.
down_revision = 'f2a7c4e19b60'
branch_labels = None
depends_on = None


def upgrade():
    # Empty: filling them is the ingest's job, so a deploy does not carry
    # 36MB of someone else's data through a migration.
    op.execute("""
        CREATE TABLE cache.pip_consultation_areas (
            -- The warehouse's key. The extract is a flattened area x contact
            -- join, so this is what the ingest groups by: 415 rows in, 298
            -- out.
            cnsltn_area_guid              varchar(32)  PRIMARY KEY,
            -- What the style keys on. A trailing space here is real and must
            -- survive: the renderer matches on it.
            cnsltn_area_name              varchar(100) NOT NULL,
            cnsltn_area_label             integer,
            cnsltn_area_mapsource         varchar(100),
            cnsltn_area_verified_ind      varchar(1),
            cnsltn_area_low_confidence_ind varchar(1),
            cnsltn_area_sensitivity       varchar(30),
            cnsltn_area_asserted_agg_ind  varchar(1),
            cnsltn_area_update_date       date,
            contact_type                  varchar(30),
            feature_code                  varchar(10),
            feature_area_sqm              double precision,
            feature_length_m              double precision,
            contact_count                 integer NOT NULL,
            -- One entry per nation, holding the fields the popup draws and
            -- no more: the gate in front of this layer is an IDIR token in
            -- the realm, so what the ingest does not carry is the only thing
            -- that cannot be read. source_select.sql is where that is decided.
            --
            -- ORGANIZATION_TYPE is in here rather than as a column because 21
            -- of the 298 areas have contacts of more than one type.
            contacts                      jsonb   NOT NULL,
            -- 3857 because ST_AsMVTGeom needs both arguments in one SRS.
            -- Transforming once here beats 1.5 million vertices per request,
            -- and keeps the index in the same CRS as the bbox filter.
            geom                          geometry(MultiPolygon, 3857) NOT NULL,
            -- The same outline simplified, for the zooms where full detail is
            -- read only to be snapped onto the same integers.
            geom_generalized              geometry(MultiPolygon, 3857),
            loaded_date                   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        )
    """)

    op.execute("""
        CREATE INDEX ix_pip_consultation_areas_geom
            ON cache.pip_consultation_areas USING GIST (geom)
    """)
    op.execute("""
        CREATE INDEX ix_pip_consultation_areas_geom_generalized
            ON cache.pip_consultation_areas USING GIST (geom_generalized)
    """)
    op.execute("""
        CREATE INDEX ix_pip_consultation_areas_name
            ON cache.pip_consultation_areas (cnsltn_area_name)
    """)

    op.execute("""
        -- Every attempt to refresh an extract, refusals included - which is
        -- the point. Running unattended, a bad extract produces no error
        -- anybody reads, just a map still serving last month's boundaries.
        -- The row has to outlive the transaction that rolled back.
        CREATE TABLE cache.local_layer_loads (
            id            serial PRIMARY KEY,
            object_name   varchar(200) NOT NULL,
            -- loaded  - the stored extract was replaced by this one
            -- refused - rejected; the stored extract still stands
            -- skipped - byte-for-byte what is loaded, so nothing to do
            -- failed  - could not run at all, so nothing was judged
            -- No CHECK constraint: a new outcome should be a code change, not
            -- a migration blocking a deploy at 09:00.
            status        varchar(10) NOT NULL,
            -- By name, not path: the same extract arrives in a different
            -- directory on every machine.
            source_name   varchar(400) NOT NULL,
            -- Over every file of the delivery, the .lyrx included, so an
            -- unchanged republish is recognised and a symbology-only
            -- re-export still counts as a change.
            source_digest varchar(64),
            loaded_date   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
            -- What the extract held. On a refusal, what was rejected.
            area_count    integer,
            source_rows   integer,
            vertex_count  bigint,
            -- Against what was stored, so a refresh reads at a glance.
            areas_added   integer NOT NULL DEFAULT 0,
            areas_removed integer NOT NULL DEFAULT 0,
            areas_changed integer NOT NULL DEFAULT 0,
            -- Refusals, style gaps, and anything else the run said.
            notes         jsonb
        )
    """)
    op.execute("""
        CREATE INDEX ix_local_layer_loads_object_name
            ON cache.local_layer_loads (object_name, loaded_date DESC)
    """)

    op.execute("""
        CREATE TABLE cache.local_layer_styles (
            -- How a layer is identified everywhere else here.
            object_name   varchar(200) PRIMARY KEY,
            -- The layer name inside the tile, read by both the tile SQL and
            -- the client so they cannot drift.
            source_layer  varchar(100) NOT NULL,
            min_zoom      smallint,
            -- MapLibre paint and layout, translated from the .lyrx at ingest.
            style         jsonb NOT NULL,
            -- What the translation covered. The feature values that matched
            -- no class are the ones worth acting on: they draw in the default
            -- symbol and look intentional.
            manifest      jsonb NOT NULL,
            loaded_date   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        )
    """)


def downgrade():
    op.execute('DROP TABLE IF EXISTS cache.local_layer_loads')
    op.execute('DROP TABLE IF EXISTS cache.local_layer_styles')
    op.execute('DROP TABLE IF EXISTS cache.pip_consultation_areas')
