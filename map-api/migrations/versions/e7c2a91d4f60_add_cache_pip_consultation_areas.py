"""add cache.pip_consultation_areas and cache.local_layer_styles

Revision ID: e7c2a91d4f60
Revises: b8e4f27c1a53
Create Date: 2026-09-23 00:00:00.000000

The first tenants of the cache schema: a copy of a BCGW layer we are given as
files rather than served, and the MapLibre translation of the ArcGIS style that
came with it. Both are reloadable from the source extract, which is what the
cache schema is for.

Written as raw SQL rather than with geoalchemy2's Geometry type on purpose.
geoalchemy2 is in requirements/prod.txt but not the pinned requirements.txt the
Dockerfile installs, so importing it here would upgrade cleanly on a developer's
machine and fail on deploy.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e7c2a91d4f60'
# Re-pointed from b8e4f27c1a53 when this branch caught up with develop: the
# user_layers migration had taken that parent in the meantime, and two heads off
# one revision make `flask db upgrade` refuse to run. The order is arbitrary -
# these cache tables share nothing with user_layers - so following it is free.
down_revision = 'e3f19a6c42d8'
branch_labels = None
depends_on = None


def upgrade():
    # Tables are created empty. Filling them is the ingest script's job, so a
    # deploy does not carry 36MB of someone else's data through a migration.
    op.execute("""
        CREATE TABLE cache.pip_consultation_areas (
            -- The warehouse's own key for a consultation area. The extract is a
            -- flattened area x contact join carrying each area once per
            -- contact, so this is what the ingest groups by to get one row per
            -- area - 415 rows in, 298 out.
            cnsltn_area_guid              varchar(32)  PRIMARY KEY,
            -- What the style keys on. Values can carry a trailing space, which
            -- is real and must survive: the renderer matches on it.
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
            -- Every contact folded into this row, in full: names, addresses,
            -- phone and fax numbers, email addresses, and the public and
            -- private comments. The layer is reachable only with an IDIR token,
            -- which is the protection this data is required to have, so the
            -- ingest carries the warehouse's records rather than a subset of
            -- them.
            --
            -- ORGANIZATION_TYPE and ORGANIZATION_GUID live in here rather than
            -- as columns because they describe the contact's organisation, not
            -- the area: 21 of the 298 areas have contacts of more than one
            -- type, so there is no single value to put on the row.
            contacts                      jsonb   NOT NULL,
            -- 3857 because ST_TileEnvelope speaks it and ST_AsMVTGeom needs
            -- both its arguments in one SRS. Transforming once here beats
            -- transforming 1.5 million vertices per tile request, and it keeps
            -- the index in the same CRS as the bbox filter that probes it.
            geom                          geometry(MultiPolygon, 3857) NOT NULL,
            -- The same outline, simplified, for the zooms where the whole
            -- province is a handful of tiles and full detail is read only to be
            -- snapped onto the same integers.
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
        -- Every attempt to refresh an extract, including the ones that were
        -- turned away.
        --
        -- Recording the refusals is the point. This runs unattended on a
        -- schedule, so a bad extract does not produce an error somebody reads;
        -- it produces a map that quietly goes on serving last month's
        -- boundaries. The refusal has to outlive the transaction that rolled
        -- back, which is why the ingest writes it on a fresh one.
        CREATE TABLE cache.local_layer_loads (
            id            serial PRIMARY KEY,
            object_name   varchar(200) NOT NULL,
            -- loaded  - the stored extract was replaced by this one
            -- refused - this extract was rejected, the stored one still stands
            -- skipped - byte-for-byte what is already loaded, so nothing to do
            -- failed  - the ingest could not run at all: the delivery could not
            --           be fetched, GDAL could not read it, or the database
            --           would not answer. Nothing was judged, so nothing was
            --           refused - the distinction the scheduler reads.
            -- Deliberately no CHECK constraint: a new outcome should be a code
            -- change, not a migration blocking a deploy at 09:00.
            status        varchar(10) NOT NULL,
            -- The file this came from, by name. Not a path: the same extract
            -- arrives in a different directory on every machine.
            source_name   varchar(400) NOT NULL,
            -- Content hash, so an unchanged republish is recognised as one
            -- rather than reloaded, and so the history says which file each
            -- row is really about.
            source_digest varchar(64),
            loaded_date   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
            -- What the extract held. On a refusal these describe what was
            -- rejected, not what is stored.
            area_count    integer,
            source_rows   integer,
            vertex_count  bigint,
            -- Against what was stored at the time, so a refresh can be read at
            -- a glance rather than diffed by hand.
            areas_added   integer NOT NULL DEFAULT 0,
            areas_removed integer NOT NULL DEFAULT 0,
            areas_changed integer NOT NULL DEFAULT 0,
            -- Why it was refused, what the style did not cover, and anything
            -- else the run wanted to say.
            notes         jsonb
        )
    """)
    op.execute("""
        CREATE INDEX ix_local_layer_loads_object_name
            ON cache.local_layer_loads (object_name, loaded_date DESC)
    """)

    op.execute("""
        CREATE TABLE cache.local_layer_styles (
            -- The BCGW object name, which is how a layer is identified
            -- everywhere else in this application.
            object_name   varchar(200) PRIMARY KEY,
            -- The layer name inside the vector tile. The tile SQL and the
            -- client's source-layer both read it from here so they cannot drift.
            source_layer  varchar(100) NOT NULL,
            min_zoom      smallint,
            -- MapLibre paint and layout, translated from the .lyrx at ingest.
            style         jsonb NOT NULL,
            -- What the translation covered: which classes matched no feature,
            -- and which feature values matched no class. The second is the one
            -- worth acting on, because those features draw in the default
            -- symbol and look intentional.
            manifest      jsonb NOT NULL,
            loaded_date   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        )
    """)


def downgrade():
    op.execute('DROP TABLE IF EXISTS cache.local_layer_loads')
    op.execute('DROP TABLE IF EXISTS cache.local_layer_styles')
    op.execute('DROP TABLE IF EXISTS cache.pip_consultation_areas')
