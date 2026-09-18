"""add user_favourite_folders

Revision ID: b8e4f27c1a53
Revises: d6a2b48f1c37
Create Date: 2026-09-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e4f27c1a53'
down_revision = 'd6a2b48f1c37'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_favourite_folders',
        sa.Column('created_date', sa.DateTime(), nullable=False),
        sa.Column('updated_date', sa.DateTime(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        # Not unique per user: an unnamed folder falls back to this name, so a
        # second unnamed folder would collide with the first.
        sa.Column('name', sa.String(length=100), nullable=False,
                  server_default='Untitled folder'),
        # Stored so the panel reopens the way the user left it.
        sa.Column('is_collapsed', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
        # Position among this user's folders, independent of the layers inside.
        sa.Column('sort_order', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('created_by', sa.String(length=50), nullable=True),
        sa.Column('updated_by', sa.String(length=50), nullable=True),
        # CASCADE because UserService.delete_user hard deletes the user.
        sa.ForeignKeyConstraint(['user_id'], ['staff_users.id'],
                                name='fk_user_favourite_folders_user_id',
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_user_favourite_folders_user_id'),
        'user_favourite_folders', ['user_id'], unique=False,
    )

    # Null is the top level. Existing favourites are all top level, so the
    # column needs no backfill.
    op.add_column(
        'user_favourite_layers',
        sa.Column('folder_id', sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f('ix_user_favourite_layers_folder_id'),
        'user_favourite_layers', ['folder_id'], unique=False,
    )
    # SET NULL rather than CASCADE: losing a folder must never un-favourite a
    # layer - the layers inside return to the top level.
    op.create_foreign_key(
        'fk_user_favourite_layers_folder_id',
        'user_favourite_layers', 'user_favourite_folders',
        ['folder_id'], ['id'], ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_user_favourite_layers_folder_id',
                       'user_favourite_layers', type_='foreignkey')
    op.drop_index(op.f('ix_user_favourite_layers_folder_id'),
                  table_name='user_favourite_layers')
    op.drop_column('user_favourite_layers', 'folder_id')
    op.drop_index(op.f('ix_user_favourite_folders_user_id'),
                  table_name='user_favourite_folders')
    op.drop_table('user_favourite_folders')
