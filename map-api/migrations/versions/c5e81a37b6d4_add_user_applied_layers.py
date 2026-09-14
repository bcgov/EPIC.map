"""add user_applied_layers

Revision ID: c5e81a37b6d4
Revises: a7f3c91d0e42
Create Date: 2026-09-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5e81a37b6d4'
down_revision = 'a7f3c91d0e42'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_applied_layers',
        sa.Column('created_date', sa.DateTime(), nullable=False),
        sa.Column('updated_date', sa.DateTime(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        # In the unique key from the start: project layers get their own source.
        sa.Column('source', sa.String(length=20), nullable=False,
                  server_default='bcdc'),
        sa.Column('package_id', sa.String(length=100), nullable=False),
        sa.Column('object_name', sa.String(length=200), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('opacity', sa.SmallInteger(), nullable=False,
                  server_default='100'),
        sa.Column('sort_order', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('created_by', sa.String(length=50), nullable=True),
        sa.Column('updated_by', sa.String(length=50), nullable=True),
        sa.CheckConstraint('opacity >= 0 AND opacity <= 100',
                           name='ck_user_applied_layers_opacity_range'),
        # CASCADE because UserService.delete_user hard deletes the user.
        sa.ForeignKeyConstraint(['user_id'], ['staff_users.id'],
                                name='fk_user_applied_layers_user_id',
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        # object_name, not package_id, is the identity of the thing drawn.
        sa.UniqueConstraint('user_id', 'source', 'object_name',
                            name='uq_user_applied_layers_identity'),
    )
    op.create_index(
        op.f('ix_user_applied_layers_user_id'),
        'user_applied_layers', ['user_id'], unique=False,
    )


def downgrade():
    op.drop_index(op.f('ix_user_applied_layers_user_id'),
                  table_name='user_applied_layers')
    op.drop_table('user_applied_layers')
