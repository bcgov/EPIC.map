"""Add app.audit_events with host_app

Revision ID: a7f3c91d0e42
Revises: 9c4d1f7a2b31
Create Date: 2026-09-02 09:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7f3c91d0e42'
down_revision = '9c4d1f7a2b31'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE SCHEMA IF NOT EXISTS app')

    op.create_table(
        'audit_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('occurred_at', sa.DateTime(), nullable=False),
        sa.Column('auth_guid', sa.String(length=100), nullable=True),
        sa.Column('idir_username', sa.String(length=100), nullable=True),
        # Never null. The default means a row written without a client reads as
        # 'unknown', so a null appearing here later is a bug in the writer
        # rather than a period of history that predates the column.
        sa.Column(
            'host_app',
            sa.String(length=100),
            nullable=False,
            server_default='unknown',
        ),
        sa.Column('method', sa.String(length=10), nullable=False),
        sa.Column('path', sa.String(length=500), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='app',
    )
    op.create_index(
        op.f('ix_app_audit_events_auth_guid'),
        'audit_events',
        ['auth_guid'],
        unique=False,
        schema='app',
    )
    op.create_index(
        op.f('ix_app_audit_events_host_app'),
        'audit_events',
        ['host_app'],
        unique=False,
        schema='app',
    )

    # Backfill. This matches nothing today because the table is created above -
    # there is no history to carry forward. It is kept because it is the
    # statement that makes the guarantee true if this migration is ever applied
    # to an environment where the table was created out of band without the
    # column, and because the NOT NULL above is what enforces it from here on.
    op.execute("UPDATE app.audit_events SET host_app = 'unknown' WHERE host_app IS NULL")


def downgrade():
    op.drop_index(op.f('ix_app_audit_events_host_app'), table_name='audit_events', schema='app')
    op.drop_index(op.f('ix_app_audit_events_auth_guid'), table_name='audit_events', schema='app')
    op.drop_table('audit_events', schema='app')
    # The schema is left in place: dropping it would take anything else that
    # has since been created in it.
