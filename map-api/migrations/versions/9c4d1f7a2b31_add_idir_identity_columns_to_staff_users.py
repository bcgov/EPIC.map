"""add idir identity columns to staff_users

Revision ID: 9c4d1f7a2b31
Revises: 3b1c7a04f9d2
Create Date: 2026-08-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9c4d1f7a2b31'
down_revision = '3b1c7a04f9d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('staff_users', sa.Column('auth_guid', sa.String(length=100), nullable=True))
    op.add_column('staff_users', sa.Column('last_login_at', sa.DateTime(), nullable=True))
    op.add_column(
        'staff_users',
        sa.Column('is_active', sa.Boolean(), server_default='t', nullable=False),
    )
    op.create_index(
        op.f('ix_staff_users_auth_guid'), 'staff_users', ['auth_guid'], unique=True
    )


def downgrade():
    op.drop_index(op.f('ix_staff_users_auth_guid'), table_name='staff_users')
    op.drop_column('staff_users', 'is_active')
    op.drop_column('staff_users', 'last_login_at')
    op.drop_column('staff_users', 'auth_guid')
