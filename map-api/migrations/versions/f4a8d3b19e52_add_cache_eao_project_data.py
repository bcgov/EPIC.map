"""add cache.eao_project_data

Revision ID: f4a8d3b19e52
Revises: e7c2a91d4f60
Create Date: 2026-10-16 00:00:00.000000

EAO's project footprints, components and value components, delivered as one
GeoPackage of three feature classes and served as one mixed-geometry layer.

Raw SQL rather than geoalchemy2's Geometry type, as for the PIP table:
geoalchemy2 is in requirements/prod.txt but not the pinned requirements.txt the
Dockerfile installs.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f4a8d3b19e52'
down_revision = 'e7c2a91d4f60'
branch_labels = None
depends_on = None


def upgrade():
    # Empty: filling it is the ingest's job.
    op.execute("""
        CREATE TABLE cache.eao_project_data (
            -- EAO's GlobalID, which the polygon class gained in the
            -- 16/10/2026 delivery. The line and point classes' ids were
            -- byte-identical across the two deliveries either side of that,
            -- which is the evidence they persist.
            --
            -- Not OBJECTID: that is a contiguous 1..n assigned at export, so
            -- it moves as rows are added or reordered.
            feature_id        varchar(38) PRIMARY KEY,

            -- Which of the three feature classes this row came from. Kept for
            -- the identify popup and for reading the load history.
            source_layer      varchar(10) NOT NULL,

            -- What the style matches on. Derived at ingest by the rule in
            -- services/local_layer_service/eao_categories.py, which also
            -- builds the style that reads it.
            style_category    varchar(20) NOT NULL,
            -- Amendment is a Track work type rather than a kind of geometry,
            -- so it is carried for the popup and the filter as well as
            -- feeding the category.
            is_amendment      boolean     NOT NULL,
            is_footprint      boolean     NOT NULL,

            -- The join to EPIC.Track. Not EPC_PP_SYD or EngageId, which are
            -- different systems' ids and disagree with this one.
            track_id          integer     NOT NULL,
            project_name      varchar(254) NOT NULL,
            proponent         varchar(254),

            label             varchar(254) NOT NULL,
            comment           varchar(254),
            category          varchar(254),
            subcategory       varchar(254),
            component_type    varchar(254),
            -- The delivery's Number (Amendment on the point layer): an
            -- amendment's name where it has one.
            amendment_number  varchar(254),

            source_of_spatial varchar(254),
            gis_adjusted      boolean,
            gis_comment       varchar(254),
            -- Carried per row for the UI to act on, not to filter the load:
            -- this application is internal and all of it is available to
            -- staff. Showing a marker and defaulting these off is its own
            -- ticket.
            sensitive         boolean,
            data_restriction  varchar(254),

            -- Null where the delivered value is not a usable date. The first
            -- delivery has 30 rows carrying a length measurement read as a
            -- 1900-system serial, and 91 dated two months out.
            date_received     date,
            -- Engage's own id, null where the delivery says 'None'.
            engage_id         integer,
            from_engage       boolean,

            -- Geometry, not MultiPolygon: one layer holds polygons, lines and
            -- points. 3857 because ST_AsMVTGeom needs both arguments in one
            -- SRS.
            geom              geometry(Geometry, 3857) NOT NULL,
            -- Null for points, which have nothing useful to simplify to. The
            -- tile SQL coalesces rather than switching column for that
            -- reason.
            geom_generalized  geometry(Geometry, 3857),
            loaded_date       timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        )
    """)

    op.execute("""
        CREATE INDEX ix_eao_project_data_geom
            ON cache.eao_project_data USING GIST (geom)
    """)
    op.execute("""
        CREATE INDEX ix_eao_project_data_geom_generalized
            ON cache.eao_project_data USING GIST (geom_generalized)
    """)
    # The panel asks for one project's features, which is the only non-spatial
    # way this table is read.
    op.execute("""
        CREATE INDEX ix_eao_project_data_track_id
            ON cache.eao_project_data (track_id)
    """)
    # Footprints are drawn on their own, and are a fifth of the rows.
    op.execute("""
        CREATE INDEX ix_eao_project_data_style_category
            ON cache.eao_project_data (style_category)
    """)


def downgrade():
    op.execute('DROP TABLE IF EXISTS cache.eao_project_data')
