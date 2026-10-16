"""add description and last_updated to applied and favourite layers

Revision ID: f2a7c4e19b60
Revises: e3f19a6c42d8
Create Date: 2026-10-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a7c4e19b60'
down_revision = 'e3f19a6c42d8'
branch_labels = None
depends_on = None

TABLES = ('user_applied_layers', 'user_favourite_layers')


def upgrade():
    # Snapshots, like display_name. Null for rows stored before this.
    for table in TABLES:
        op.add_column(
            table, sa.Column('description', sa.String(length=1000), nullable=True)
        )
        op.add_column(table, sa.Column('last_updated', sa.Date(), nullable=True))


def downgrade():
    for table in TABLES:
        op.drop_column(table, 'last_updated')
        op.drop_column(table, 'description')
