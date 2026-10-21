"""add app.local_layer_feature_history

Revision ID: a1d7e6c04b93
Revises: f4a8d3b19e52
Create Date: 2026-10-16 00:00:00.000000

What changed about one feature of a hosted layer, and when.

In `app` rather than `cache` deliberately. The cache schema's contract is that
everything in it is reloadable from the source extract; this is the one thing
that is not, because a delivery carries the current state and nothing of what
it replaced. Dropping and rebuilding the cache is a supported thing to do, and
it must not take the change record with it.

Raw SQL rather than op.create_table, unlike the rest of the app schema: the
previous geometry needs a PostGIS type, and geoalchemy2 is in
requirements/prod.txt but not the pinned requirements.txt the Dockerfile
installs.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a1d7e6c04b93'
down_revision = 'f4a8d3b19e52'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE app.local_layer_feature_history (
            id            bigserial PRIMARY KEY,
            -- The layer, as LOCAL_LAYERS and cache.local_layer_loads name it.
            object_name   varchar(200) NOT NULL,
            -- The layer's own key for the feature. EAO's GlobalID for the
            -- project data, which is what makes a row here answerable:
            -- without a stable id there is nothing to hang a history on.
            feature_id    varchar(200) NOT NULL,

            -- added   - in this delivery, not the one before
            -- changed - the same feature, differing in an attribute or shape
            -- removed - in the previous delivery, not this one
            -- No CHECK constraint, for the reason local_layer_loads gives:
            -- a new outcome should be a code change, not a migration.
            change        varchar(10) NOT NULL,
            occurred_at   timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),

            -- Which delivery did it, by name and by the digest that ties this
            -- back to the cache.local_layer_loads row for the same run.
            source_name   varchar(400) NOT NULL,
            source_digest varchar(64),

            -- Which attributes differ. Null on an add, where every value is
            -- new and naming them all says nothing.
            changed_columns text[],
            -- The attributes as they were before this delivery. Null on an
            -- add. The current state is the cache table's, so recording what
            -- it replaced is the half that would otherwise be lost.
            previous      jsonb,
            -- Only when the geometry itself changed, which is the rare case:
            -- the 16/10/2026 delivery changed 168 attributes and one shape.
            -- Kept out of `previous` because geometry is the bulk of this
            -- data - one polygon is 3.2MB where the average row is 31KB.
            previous_geom geometry(Geometry, 3857)
        )
    """)

    # The question this table exists to answer: what has happened to this
    # feature, most recent first.
    op.execute("""
        CREATE INDEX ix_local_layer_feature_history_feature
            ON app.local_layer_feature_history (object_name, feature_id, occurred_at DESC)
    """)
    # And the other direction: what changed in a period, across the layer.
    op.execute("""
        CREATE INDEX ix_local_layer_feature_history_occurred
            ON app.local_layer_feature_history (object_name, occurred_at DESC)
    """)


def downgrade():
    op.execute('DROP TABLE IF EXISTS app.local_layer_feature_history')
