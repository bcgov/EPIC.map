"""add source_updated_date to cache.local_layer_loads

Revision ID: c61e31a3ead5
Revises: a1d7e6c04b93
Create Date: 2026-11-09 00:00:00.000000

The delivered file's own date, shown as a hosted layer's last updated.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'c61e31a3ead5'
down_revision = 'a1d7e6c04b93'
branch_labels = None
depends_on = None


def upgrade():
    # UTC, like loaded_date; null where the file has no date.
    op.execute("""
        ALTER TABLE cache.local_layer_loads
            ADD COLUMN source_updated_date timestamp
    """)


def downgrade():
    op.execute("""
        ALTER TABLE cache.local_layer_loads
            DROP COLUMN IF EXISTS source_updated_date
    """)
