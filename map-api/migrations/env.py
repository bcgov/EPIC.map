from __future__ import with_statement

import logging
from logging.config import fileConfig

import sqlalchemy as sa
from alembic import context
from flask import current_app


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
config.set_main_option(
    'sqlalchemy.url',
    str(current_app.extensions['migrate'].db.engine.url).replace('%', '%%'))
target_metadata = current_app.extensions['migrate'].db.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

# Schemas autogenerate must leave alone. include_schemas=True below makes
# alembic compare every schema in the database against the model metadata, and
# anything real that is absent from that metadata reads to it as a table someone
# deleted - so it writes a DROP. Without this filter, `flask db migrate` writes
# a migration that drops the cache tables and most of PostGIS with them.
#
# `cache` holds copies of data owned elsewhere, created by hand-written
# migrations and filled by an ingest script, with no SQLAlchemy model to compare
# against.
UNMANAGED_SCHEMAS = {'cache'}

# Tables belonging to an installed extension, filled from the database below.
# PostGIS brings about seventy of them - the tiger geocoder's lookup tables, the
# topology catalogue and spatial_ref_sys - and they arrive here with their
# schema unset as often as not, so filtering by schema name alone misses them
# and listing them by hand would go stale the next time PostGIS is upgraded.
EXTENSION_TABLES = set()

# Every table an extension owns, whatever schema it sits in. `pg_depend` is what
# CREATE EXTENSION writes to record that ownership, so this asks Postgres the
# question directly rather than encoding a version of PostGIS's contents here.
EXTENSION_TABLES_SQL = """
    SELECT c.relname
    FROM pg_depend d
    JOIN pg_extension e
      ON d.refobjid = e.oid AND d.refclassid = 'pg_extension'::regclass
    JOIN pg_class c
      ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
    WHERE c.relkind IN ('r', 'p', 'f', 'v', 'm')
"""


def include_object(object_, name, type_, reflected, compare_to):  # pylint: disable=unused-argument
    """Tell autogenerate which database objects it owns.

    Runs against reflected objects as well as model ones, so a table is filtered
    wherever it is seen.
    """
    if type_ != 'table':
        return True

    if getattr(object_, 'schema', None) in UNMANAGED_SCHEMAS:
        return False

    return name not in EXTENSION_TABLES


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=target_metadata, literal_binds=True,
        include_schemas=True, include_object=include_object
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # this callback is used to prevent an auto-migration from being generated
    # when there are no changes to the schema
    # reference: http://alembic.zzzcomputing.com/en/latest/cookbook.html
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    connectable = current_app.extensions['migrate'].db.engine

    # On a connection of its own, and finished with before the migration's is
    # opened. Querying on the migration connection would leave an implicit
    # transaction open that alembic does not know it owns, and every bit of DDL
    # the upgrade then ran would roll back when the connection closed - an
    # upgrade that logs every step, sets the version, and leaves an empty
    # database behind.
    with connectable.connect() as probe:
        EXTENSION_TABLES.update(
            row[0] for row in probe.execute(sa.text(EXTENSION_TABLES_SQL))
        )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            process_revision_directives=process_revision_directives,
            include_schemas=True,
            include_object=include_object,
            **current_app.extensions['migrate'].configure_args
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
