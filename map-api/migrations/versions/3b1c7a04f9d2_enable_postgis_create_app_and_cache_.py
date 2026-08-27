"""enable postgis, create app and cache schemas

Revision ID: 3b1c7a04f9d2
Revises: 20bcb68bc2ac
Create Date: 2026-08-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3b1c7a04f9d2'
down_revision = '20bcb68bc2ac'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis')
    op.execute('CREATE SCHEMA IF NOT EXISTS app')
    op.execute('CREATE SCHEMA IF NOT EXISTS cache')


def downgrade():
    op.execute('DROP SCHEMA IF EXISTS cache')
    op.execute('DROP SCHEMA IF EXISTS app')
    # postgis is left enabled; dropping it would break any other database
    # object that still depends on it.
