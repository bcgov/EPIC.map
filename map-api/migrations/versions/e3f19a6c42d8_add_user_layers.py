"""add user_layers and user_layer_features

Revision ID: e3f19a6c42d8
Revises: b8e4f27c1a53
Create Date: 2026-09-25 00:00:00.000000

"""
from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'e3f19a6c42d8'
down_revision = 'b8e4f27c1a53'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_layers',
        sa.Column('created_date', sa.DateTime(), nullable=False),
        sa.Column('updated_date', sa.DateTime(), nullable=True),
        # Chosen by the client, so a retried upload finds the row it wrote.
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('is_sensitive', sa.Boolean(), nullable=False),
        sa.Column('source_format', sa.String(length=20), nullable=False),
        sa.Column('source_filename', sa.String(length=255), nullable=False),
        # Null when the file arrived in WGS 84.
        sa.Column('source_crs', sa.String(length=255), nullable=True),
        sa.Column('geometry_type', sa.String(length=20), nullable=False),
        sa.Column('feature_count', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('extent', geoalchemy2.Geometry(
            geometry_type='GEOMETRY', srid=4326, spatial_index=False,
        ), nullable=True),
        sa.Column('created_by', sa.String(length=50), nullable=True),
        sa.Column('updated_by', sa.String(length=50), nullable=True),
        sa.CheckConstraint(
            "source_format IN ('GeoJSON', 'KML', 'Shapefile')",
            name='ck_user_layers_source_format',
        ),
        sa.CheckConstraint(
            "geometry_type IN ('Point', 'Line', 'Polygon', 'Mixed')",
            name='ck_user_layers_geometry_type',
        ),
        sa.CheckConstraint('feature_count >= 0',
                           name='ck_user_layers_feature_count'),
        # CASCADE because UserService.delete_user hard deletes the user.
        sa.ForeignKeyConstraint(['user_id'], ['staff_users.id'],
                                name='fk_user_layers_user_id',
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_layers_user_id'), 'user_layers',
                    ['user_id'], unique=False)
    op.create_index('uq_user_layers_user_id_name', 'user_layers',
                    ['user_id', sa.text('lower(name)')], unique=True)

    op.create_table(
        'user_layer_features',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('layer_id', sa.Uuid(), nullable=False),
        sa.Column('geom', geoalchemy2.Geometry(
            geometry_type='GEOMETRY', srid=3005, spatial_index=False,
        ), nullable=False),
        sa.Column('properties', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default='{}'),
        sa.ForeignKeyConstraint(['layer_id'], ['user_layers.id'],
                                name='fk_user_layer_features_layer_id',
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_layer_features_layer_id'),
                    'user_layer_features', ['layer_id'], unique=False)
    op.create_index('ix_user_layer_features_geom', 'user_layer_features',
                    ['geom'], unique=False, postgresql_using='gist')


def downgrade():
    op.drop_index('ix_user_layer_features_geom',
                  table_name='user_layer_features')
    op.drop_index(op.f('ix_user_layer_features_layer_id'),
                  table_name='user_layer_features')
    op.drop_table('user_layer_features')
    op.drop_index('uq_user_layers_user_id_name', table_name='user_layers')
    op.drop_index(op.f('ix_user_layers_user_id'), table_name='user_layers')
    op.drop_table('user_layers')
