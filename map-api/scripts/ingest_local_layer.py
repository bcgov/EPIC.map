#!/usr/bin/env python
# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Load a hosted layer's extract, and its style, into PostGIS.

EAO exports layers this API cannot reach in the warehouse: the features as a
GeoPackage, the symbology as a .lyrx beside it, because no interchange format
carries both.

Runs unattended against a database that already holds a good copy, so it is
built to refuse rather than overwrite. Staging, checking, replacing and storing
the style are one transaction; anything wrong rolls back and the previous load
stands. Every attempt is recorded in cache.local_layer_loads, refusals
included, on a connection that outlives the rollback - otherwise a bad extract
leaves no trace and the map quietly serves last month's boundaries.

What differs between layers is in local_layer_service/ingest_spec.py.

  make ingest-local-layer LAYER=pip SOURCE=... LYRX=...   load a file
  make ingest-pip-s3                                      load the delivery
  (add -dry-run to either to say what it would do)

Two ways in, one load: --source for files already here, --from-s3 for the keys
the spec names. They meet past the download, so the rehearsed load is the one
that runs.

Exit codes, which are the scheduler's side of the conversation:

  0  loaded, or nothing to do
  1  refused - a data problem, look at the file
  2  could not run - a system problem, look at us

GDAL is not a dependency of this repo, so a laptop runs ogr2ogr from a pinned
container and the pod runs an image built FROM that same tag. See ogr.py.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
SQL_ROOT = SCRIPT_DIR / 'sql'

# Importable once this is on the path: the .lyrx translation, the per-layer
# descriptors and the rules for whether a staged extract may replace the stored
# one all live with the service that serves them.
sys.path.insert(0, str(SCRIPT_DIR.parent / 'src'))

# pylint: disable=wrong-import-position
from map_api.config import get_ingest_config  # noqa: E402,I005
from map_api.services.local_layer_service import LOCAL_LAYERS, ogr  # noqa: E402,I005
from map_api.services.local_layer_service.ingest import (  # noqa: E402,I005
    DEFAULT_MIN_RATIO, CannotRunError, LoadComparison, StyleCoverage, assess)
from map_api.services.local_layer_service.ingest_spec import INGEST_SPECS  # noqa: E402,I005
from map_api.services.local_layer_service.eao_categories import (  # noqa: E402,I005
    eao_style,
    style_manifest,
)
from map_api.services.local_layer_service.lyrx import (  # noqa: E402,I005
    UnsupportedRendererError, unique_value_paint)
from map_api.services.local_layer_service.s3 import fetch  # noqa: E402,I005


# What the scheduler reads.
EXIT_OK = 0
EXIT_REFUSED = 1
EXIT_FAILED = 2

# How old a stored extract may get before its age is worth saying out loud.
# Nothing enforces it - the ingest cannot fix a file that nobody has re-exported
# - but a refusal that mentions three weeks reads very differently from one
# that mentions a day.
STALE_AFTER_DAYS = 14


def parse_args():
    """Read the layer, where the extract comes from, the database, and how careful to be."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layer', required=True, choices=sorted(INGEST_SPECS),
                        help='which layer to load')
    parser.add_argument('--source', action='append',
                        help='the GeoPackage (or any OGR-readable extract). '
                             'Repeat it once per source layer, in the order '
                             'the spec lists them, for a layer delivered as '
                             'separate files')
    parser.add_argument('--from-s3', action='store_true',
                        help='fetch the delivery from object storage, at the '
                             'keys the layer spec names, instead of passing '
                             '--source')
    parser.add_argument('--lyrx',
                        help='the ArcGIS layer file carrying the symbology. '
                             'Required with --source; fetched for you with '
                             '--from-s3')
    parser.add_argument('--gdal', choices=ogr.MODES,
                        default=os.getenv('INGEST_GDAL', 'auto'),
                        help='run ogr2ogr from PATH, from the pinned container, '
                             'or whichever is available (default auto)')
    parser.add_argument('--keep-download', action='store_true',
                        help='leave the fetched files behind and say where, '
                             'instead of clearing them away')
    parser.add_argument('--database-url', default=os.getenv('DATABASE_URL'),
                        help='postgresql://user:password@host:port/dbname. '
                             'Defaults to the DATABASE_* environment the API '
                             'itself reads')
    parser.add_argument('--dry-run', action='store_true',
                        help='stage and check the extract, report what it '
                             'would change, then roll back')
    parser.add_argument('--allow-shrink', action='store_true',
                        help='load an extract that is materially smaller than '
                             'the one already stored')
    parser.add_argument('--force', action='store_true',
                        help='reload even if the extract is byte-for-byte the '
                             'one already loaded')
    parser.add_argument('--min-ratio', type=float, default=DEFAULT_MIN_RATIO,
                        help='how much smaller a new extract may be before it '
                             f'is refused (default {DEFAULT_MIN_RATIO})')
    return parser.parse_args()


@dataclass(frozen=True)
class PgTarget:
    """The database to load, with its credentials decoded once.

    db_uri() percent-encodes and urlparse does not decode, so a password with
    @ / : or % in it would otherwise authenticate as '%40'.
    """

    host: str
    port: int
    user: str
    password: str
    dbname: str


def target_from_url(database_url: str) -> PgTarget:
    """Read a connection target out of a postgresql:// URL.

    Neither failure quotes the URL: it holds the password, and these messages
    reach a Job log readable by more people than the secret is.
    """
    try:
        parsed = urlparse(database_url)
        # Both parse on access and both raise: an unencoded / or # moves the
        # delimiters, and a non-numeric port is its own ValueError.
        hostname, port = parsed.hostname, parsed.port
    except ValueError:
        # Neither the text nor the chained cause: urllib names whatever it took
        # for the port, which for 'hunter2/x' is "hunter2".
        raise CannotRunError(
            'the database URL could not be parsed. A password containing '
            '@ : / ? # or % has to be percent-encoded; expected '
            'postgresql://user:password@host:port/dbname'
        ) from None

    if not hostname:
        raise CannotRunError(
            'no host in the database URL; expected '
            'postgresql://user:password@host:port/dbname'
        )

    return PgTarget(
        host=hostname,
        port=port or 5432,
        user=unquote(parsed.username or ''),
        password=unquote(parsed.password or ''),
        dbname=unquote((parsed.path or '').lstrip('/')),
    )


def pg_dsn(target: PgTarget) -> str:
    """Build the PG: string for ogr2ogr, quoted the way libpq expects.

    Keyword/value syntax, not a URL. Everything is quoted rather than deciding
    which values need it.
    """
    def quoted(value) -> str:
        escaped = str(value).replace('\\', '\\\\').replace("'", "\\'")
        return f"'{escaped}'"

    return 'PG:' + ' '.join(
        f'{key}={quoted(value)}'
        for key, value in (
            ('host', target.host), ('port', target.port),
            ('dbname', target.dbname), ('user', target.user),
            ('password', target.password),
        )
    )


def connect(target: PgTarget):
    """Open the one connection the whole load runs on.

    A database that will not answer is a CannotRunError: left to psycopg2 it
    exits 1, which sends the reader to the file instead of the database.
    """
    # Imported here so --help works without the venv's dependencies.
    import psycopg2  # pylint: disable=import-outside-toplevel

    try:
        connection = psycopg2.connect(
            host=target.host,
            port=target.port,
            user=target.user,
            password=target.password,
            dbname=target.dbname,
        )
    except psycopg2.OperationalError as error:
        raise CannotRunError(
            f'could not connect to {target.dbname} at {target.host}:{target.port} '
            f'as {target.user}: {str(error).strip()}'
        ) from error

    # Explicit: everything between here and commit() is one transaction, which
    # is what makes a failed load leave no trace.
    connection.autocommit = False
    return connection


def source_paths(spec, sources: list) -> list:
    """One path per source layer, in order.

    A delivery is either a file per layer or one file holding them all; the
    second is repeated so the callers can zip the two lists without caring.
    """
    if len(sources) == len(spec.sources):
        return list(sources)
    if len(sources) == 1:
        return [sources[0]] * len(spec.sources)
    raise CannotRunError(
        f'{spec.object_name} reads {len(spec.sources)} source layer(s) but '
        f'{len(sources)} file(s) were given; pass one per layer, or one file '
        f'holding them all'
    )


def stage(spec, sources: list, target: PgTarget, mode: str) -> float:
    """Load the extract into the staging table with ogr2ogr.

    On its own connection, being a separate process. Safe: the staging table is
    disposable and nothing reaches the map until the transaction commits.

    One call per source layer, the first overwriting and the rest appending, so
    three shapefiles and a three-layer GeoPackage land the same.
    """
    dsn = pg_dsn(target)
    sql_dir = SQL_ROOT / spec.sql_dir
    build = ogr.command_for(mode)

    started = time.monotonic()
    paired = zip(source_paths(spec, sources), spec.sources)
    for index, (source, source_layer) in enumerate(paired):
        result = subprocess.run(
            build(spec, source, source_layer, index, sql_dir, dsn), check=False)

        if result.returncode != 0:
            raise CannotRunError(
                f'ogr2ogr failed on {source.name}:{source_layer.name} '
                f'({result.returncode})'
            )
    return time.monotonic() - started


def take_lock(connection, spec) -> bool:
    """Claim the right to be the only load of this layer running.

    An overrunning job meets the next one mid-write. The second does nothing
    rather than queue: its extract is the file the first is already loading.
    The key is the layer's, so one layer's load cannot silence another's.
    """
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(%s)', (spec.lock_key,))
        return bool(cursor.fetchone()[0])


def digest(paths: list, style: str = '') -> str:
    """Hash the delivery, to recognise a republish of the same files.

    Most scheduled runs are handed what is already loaded, and hashing 74MB
    saves the whole transform. Files hash as one, with each name and length
    mixed in, so three shapefiles are unchanged only when all three are.

    Every file the load reads goes in, the .lyrx included: a re-export that
    changed only the symbology is a change.

    `style` is for a layer whose symbology is ours rather than delivered, where
    no file changes when it does. It is left out of the hash when empty, so a
    delivered-style layer keeps the digest already stored for it.
    """
    import hashlib  # pylint: disable=import-outside-toplevel

    digester = hashlib.sha256()
    for path in paths:
        digester.update(f'{path.name}:{path.stat().st_size}\0'.encode('utf-8'))
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b''):  # noqa: B023
                digester.update(block)
    if style:
        digester.update(f'style:{style}\0'.encode('utf-8'))
    return digester.hexdigest()


def last_load(connection, spec, statuses: tuple) -> dict:
    """Return the most recent load in any of `statuses`, or an empty dict."""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT status, source_digest, loaded_date,
                   EXTRACT(DAY FROM (now() AT TIME ZONE 'utc') - loaded_date)::int
            FROM cache.local_layer_loads
            WHERE object_name = %s AND status = ANY(%s)
            ORDER BY loaded_date DESC
            LIMIT 1
        """, (spec.object_name, list(statuses)))
        row = cursor.fetchone()

    if not row:
        return {}
    return {'status': row[0], 'digest': row[1], 'at': row[2], 'age_days': row[3]}


def record(connection, spec, status: str, source_name: str, source_digest: str,
           comparison=None, source_rows=None, notes: dict = None):
    """Write one row of the load history, on a transaction of its own.

    Separate because a refusal has just rolled back everything it touched, and
    the record of it has to survive that.
    """
    connection.rollback()
    with connection.cursor() as cursor:
        cursor.execute("""
            INSERT INTO cache.local_layer_loads
                (object_name, status, source_name, source_digest,
                 area_count, source_rows, vertex_count,
                 areas_added, areas_removed, areas_changed, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            spec.object_name, status, source_name, source_digest,
            comparison.staged_areas if comparison else None,
            source_rows,
            comparison.staged_vertices if comparison else None,
            comparison.counted('added') if comparison else 0,
            comparison.counted('removed') if comparison else 0,
            comparison.counted('changed') if comparison else 0,
            json.dumps(notes or {}),
        ))
    connection.commit()


def run_sql_file(cursor, spec, name: str):
    """Execute one of the layer's SQL files."""
    cursor.execute((SQL_ROOT / spec.sql_dir / name).read_text(encoding='utf-8'))


class RefusedError(Exception):
    """The extract may not replace the one already stored."""

    def __init__(self, reasons: list):
        """Hold the reasons, so each can be printed and recorded separately."""
        super().__init__('; '.join(reasons))
        self.reasons = reasons


def validate(cursor, spec):
    """Run the structural checks, turning a raise into a plain refusal.

    The raise is what aborts the transaction and protects the stored extract,
    so it comes back as a sentence about the file, not a psycopg2 traceback.
    """
    import psycopg2  # pylint: disable=import-outside-toplevel

    try:
        run_sql_file(cursor, spec, 'validate.sql')
    except psycopg2.errors.RaiseException as exc:  # pylint: disable=no-member
        raise RefusedError([(exc.diag.message_primary or str(exc)).strip()]) from exc


def staged_rows(cursor, spec) -> int:
    """How many rows ogr2ogr actually wrote, before any folding."""
    cursor.execute(f'SELECT count(*) FROM {spec.staging_table}')
    return int(cursor.fetchone()[0])


def compare(cursor, spec) -> LoadComparison:
    """Set the staged extract against what is already stored.

    Before anything is written, so both sides are readable at once.
    """
    # A flattened join carries one geometry per joined row, so it is counted
    # per key; without folding, one area would count nineteen times.
    identity = spec.identity
    if identity.fold_duplicates:
        staged_source = f"""
            SELECT DISTINCT ON ({identity.key})
                   {identity.key} AS key, {identity.label} AS name, geom
            FROM {spec.staging_table}
        """
    else:
        staged_source = f"""
            SELECT {identity.key} AS key, {identity.label} AS name, geom
            FROM {spec.staging_table}
        """

    cursor.execute(f"""
        SELECT count(DISTINCT key), coalesce(sum(ST_NPoints(geom)), 0)
        FROM ({staged_source}) staged
    """)
    staged_areas, staged_vertices = cursor.fetchone()

    cursor.execute(f"""
        SELECT count(*), coalesce(sum(ST_NPoints(geom)), 0)
        FROM {spec.target_table}
    """)
    existing_areas, existing_vertices = cursor.fetchone()

    comparison = LoadComparison(
        existing_areas=int(existing_areas),
        staged_areas=int(staged_areas),
        existing_vertices=int(existing_vertices),
        staged_vertices=int(staged_vertices),
    )
    if comparison.is_first_load:
        return comparison

    # The staged key and the stored key are not always the same column: EAO
    # stages EAO's GlobalID as global_id and stores it as feature_id.
    stored_key = LOCAL_LAYERS[spec.object_name].key

    # Matched on the key and reported by name. Names are not unique in every
    # layer - EAO repeats 'project - label' across features - so joining on the
    # name counted every pair that shared one as a changed shape: an unchanged
    # delivery reported twenty.
    cursor.execute(f"""
        WITH staged AS ({staged_source}),
        stored AS (
            SELECT {stored_key} AS key, {identity.label} AS name,
                   md5(ST_AsBinary(geom)) AS shape
            FROM {spec.target_table}
        ),
        staged_shapes AS (
            SELECT key, name, md5(ST_AsBinary(geom)) AS shape FROM staged
        )
        SELECT
            array(SELECT name FROM staged_shapes
                   WHERE key NOT IN (SELECT key FROM stored) ORDER BY 1),
            array(SELECT name FROM stored
                   WHERE key NOT IN (SELECT key FROM staged_shapes) ORDER BY 1),
            array(SELECT s.name FROM staged_shapes s JOIN stored p USING (key)
                  WHERE s.shape <> p.shape ORDER BY 1)
    """)
    comparison.added, comparison.removed, comparison.changed = cursor.fetchone()
    return comparison


def build_style(spec, lyrx_path) -> tuple:
    """Return the MapLibre style to store, from wherever this layer's comes.

    A spec that owns its style has no file to read, so nothing here can refuse:
    the style is in the tree and a test covers it.

    A .lyrx this cannot translate is a RefusedError: a judgement about a
    delivered file, so it goes through the refusal path and leaves a history
    row. Being invoked without one at all stays a CannotRunError.
    """
    mvt_layer = _mvt_layer(spec)

    if spec.owns_style:
        return _name_source_layers(eao_style(), _mvt_layer(spec)), style_manifest()

    if lyrx_path is None:
        raise CannotRunError(f'--lyrx is required for {spec.object_name}')

    try:
        document = json.loads(lyrx_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RefusedError(
            [f'{lyrx_path.name} is not readable as JSON: {exc}']
        ) from exc
    except OSError as exc:
        raise CannotRunError(f'could not read {lyrx_path}: {exc}') from exc

    definitions = document.get('layerDefinitions') or []
    if not definitions:
        raise RefusedError([f'{lyrx_path.name} carries no layer definitions'])

    try:
        style, manifest = unique_value_paint(definitions[0])
    except UnsupportedRendererError as exc:
        raise RefusedError(
            [f'{lyrx_path.name} cannot be translated: {exc}']
        ) from exc

    return _name_source_layers(style, mvt_layer), manifest


def owned_style_digest(spec) -> str:
    """Hash the style a spec builds for itself, or '' where one is delivered.

    The delivery is what the digest normally watches, but for EAO the symbology
    comes from eao_categories.py and no delivered byte changes when a colour or
    a width does. Without this, the next scheduled run reads the same digest,
    skips, and the style in cache.local_layer_styles stays stale until EAO sends
    a new file or somebody runs with --force.

    Hashes the style as it would be stored, the manifest included, so a renamed
    MVT layer counts as a change too.
    """
    import hashlib  # pylint: disable=import-outside-toplevel

    if not spec.owns_style:
        return ''

    # build_style cannot refuse for a spec that owns its style, so no .lyrx and
    # no error path: it is the same call the load makes further down.
    built = json.dumps(build_style(spec, None), sort_keys=True)
    return hashlib.sha256(built.encode('utf-8')).hexdigest()


def _name_source_layers(style: dict, mvt_layer: str) -> dict:
    """Fill in the MVT layer name on every layer spec that left it open.

    A style says how to draw, not where from. One that names a layer already,
    as a multi-geometry style does, is left alone.
    """
    for spec_layer in style['layers']:
        if spec_layer.get('sourceLayer') is None:
            spec_layer['sourceLayer'] = mvt_layer
    return style


def _mvt_layer(spec) -> str:
    """Return the layer name inside the vector tile, from the serving registry.

    Read from there so the tile SQL and the client cannot drift apart.
    """
    from map_api.services.local_layer_service import LOCAL_LAYERS  # pylint: disable=import-outside-toplevel

    return LOCAL_LAYERS[spec.object_name].mvt_layer


def check_style_against(cursor, spec, manifest: dict) -> StyleCoverage:
    """Measure which staged values the style covers, and which it does not.

    A style of ours covers its own categories by construction: the same module
    derives the stored value and matches on it, so there is nothing to measure.
    """
    if spec.owns_style:
        return StyleCoverage(matched=staged_rows(cursor, spec))

    column = spec.style_coverage_column
    cursor.execute(f'SELECT DISTINCT {column} FROM {spec.staging_table}')
    names = {row[0] for row in cursor.fetchall()}
    classes = set(manifest['classes'])
    return StyleCoverage(
        unmatched=sorted(names - classes), matched=len(classes & names),
    )


def write_style(cursor, spec, style: dict, manifest: dict):
    """Replace this layer's style row, inside the load's transaction.

    source_layer and min_zoom are columns too, so the row reads without
    parsing the JSON.
    """
    cursor.execute("""
        INSERT INTO cache.local_layer_styles
            (object_name, source_layer, min_zoom, style, manifest, loaded_date)
        VALUES (%s, %s, %s, %s, %s, now() AT TIME ZONE 'utc')
        ON CONFLICT (object_name) DO UPDATE SET
            source_layer = EXCLUDED.source_layer,
            min_zoom     = EXCLUDED.min_zoom,
            style        = EXCLUDED.style,
            manifest     = EXCLUDED.manifest,
            loaded_date  = EXCLUDED.loaded_date
    """, (spec.object_name,
          style['layers'][0]['sourceLayer'],
          style['source'].get('minZoom'),
          json.dumps(style), json.dumps(manifest)))


# Where the change record lives. In `app`, not `cache`: everything in the cache
# schema is reloadable from the source extract, and this is the one thing that
# is not.
HISTORY_TABLE = 'app.local_layer_feature_history'

# The temp table holding the stored rows while the transform replaces them.
# ON COMMIT DROP, so a rollback and a commit both clear it.
PREVIOUS_TABLE = 'ingest_previous'


def capture_previous(cursor, spec):
    """Copy the stored rows aside before the transform truncates them.

    The diff is taken against the transformed shape rather than the staged one
    because that is what the map serves, and because the two are not
    comparable: a staged date is the delivery's text, a stored one is a date.
    """
    cursor.execute(
        f'CREATE TEMP TABLE {PREVIOUS_TABLE} ON COMMIT DROP AS '
        f'SELECT * FROM {spec.target_table}'
    )


def rebuilt_from_empty(cursor, spec) -> bool:
    """Whether this load is refilling a table whose history already exists.

    The history is in `app` so that it survives a cache rebuild, and the ingest
    reloads an unchanged delivery into an emptied table. Those two together
    would write an `added` row for every feature, dated the rebuild - which is
    not what `added` means, and would answer "when did this footprint first
    appear" with the day the cache was dropped.
    """
    cursor.execute(f'SELECT count(*) FROM {PREVIOUS_TABLE}')
    if int(cursor.fetchone()[0]) > 0:
        return False

    cursor.execute(
        f'SELECT count(*) FROM {HISTORY_TABLE} WHERE object_name = %s',
        (spec.object_name,))
    return int(cursor.fetchone()[0]) > 0


def _attribute_json(alias: str, columns: tuple) -> str:
    """Build a jsonb object of one row's attributes, to compare and to store."""
    pairs = ', '.join(f"'{name}', {alias}.{name}" for name in columns)
    return f'jsonb_build_object({pairs})'


def write_feature_history(cursor, spec, source_name: str, source_digest: str) -> dict:
    """Record what this load did to each feature, and return the counts.

    Runs after the transform and inside its transaction: a load that rolls back
    changed nothing, so it has no history to write.

    Attributes are compared as jsonb rather than column by column so that the
    set of columns comes from the registry and not from a second list here.
    """
    if rebuilt_from_empty(cursor, spec):
        # Nothing happened to any feature: the rows are the ones this layer
        # already had, put back.
        return {'added': 0, 'removed': 0, 'changed': 0}

    layer = LOCAL_LAYERS[spec.object_name]
    key = layer.key
    # The key identifies the row rather than describing it, and the geometry is
    # compared separately, so neither belongs in the attribute bag.
    columns = tuple(name for name in layer.detail_columns if name != key)

    previous = _attribute_json('p', columns)
    current = _attribute_json('c', columns)

    # Interpolated from the registry, never the request. The literals are bound.
    cursor.execute(f"""
        WITH added AS (
            INSERT INTO {HISTORY_TABLE}
                (object_name, feature_id, change, source_name, source_digest)
            SELECT %(object_name)s, c.{key}, 'added', %(source_name)s, %(digest)s
            FROM {spec.target_table} c
            LEFT JOIN {PREVIOUS_TABLE} p ON p.{key} = c.{key}
            WHERE p.{key} IS NULL
            RETURNING 1
        ),
        removed AS (
            INSERT INTO {HISTORY_TABLE}
                (object_name, feature_id, change, source_name, source_digest,
                 previous, previous_geom)
            SELECT %(object_name)s, p.{key}, 'removed', %(source_name)s,
                   %(digest)s, {previous}, p.geom
            FROM {PREVIOUS_TABLE} p
            LEFT JOIN {spec.target_table} c ON c.{key} = p.{key}
            WHERE c.{key} IS NULL
            RETURNING 1
        ),
        differences AS (
            SELECT p.{key} AS feature_id,
                   {previous} AS was,
                   {current} AS now,
                   md5(ST_AsBinary(p.geom)) IS DISTINCT FROM
                       md5(ST_AsBinary(c.geom)) AS geom_changed,
                   p.geom AS previous_geom
            FROM {PREVIOUS_TABLE} p
            JOIN {spec.target_table} c ON c.{key} = p.{key}
        ),
        changed AS (
            INSERT INTO {HISTORY_TABLE}
                (object_name, feature_id, change, source_name, source_digest,
                 changed_columns, previous, previous_geom)
            SELECT %(object_name)s, d.feature_id, 'changed', %(source_name)s,
                   %(digest)s,
                   -- The attributes that differ, plus 'geom' where the shape
                   -- did, so one column answers "what changed".
                   (
                       SELECT coalesce(array_agg(each.key ORDER BY each.key), '{{}}')
                       FROM jsonb_each_text(d.was) AS each
                       WHERE each.value IS DISTINCT FROM (d.now ->> each.key)
                   ) || CASE WHEN d.geom_changed THEN ARRAY['geom'] ELSE '{{}}' END,
                   d.was,
                   CASE WHEN d.geom_changed THEN d.previous_geom END
            FROM differences d
            WHERE d.was <> d.now OR d.geom_changed
            RETURNING 1
        )
        SELECT (SELECT count(*) FROM added),
               (SELECT count(*) FROM removed),
               (SELECT count(*) FROM changed)
    """, {
        'object_name': spec.object_name,
        'source_name': source_name,
        'digest': source_digest,
    })

    added, removed, changed = cursor.fetchone()
    return {'added': int(added), 'removed': int(removed), 'changed': int(changed)}


def describe_changes(counts: dict) -> str:
    """Say what the load did, in one line for the operator reading the log."""
    if not any(counts.values()):
        return '  no feature changed'
    return (f"  {counts['added']} added, {counts['changed']} changed, "
            f"{counts['removed']} removed")


def report(spec, comparison: LoadComparison, assessment, dry_run: bool):
    """Say what was found, in the order someone reading it would want it."""
    if comparison.is_first_load:
        print(f'  first load: {comparison.staged_areas} {spec.noun}, '
              f'{comparison.staged_vertices:,} vertices')
    else:
        print(f'  stored: {comparison.existing_areas} {spec.noun}, '
              f'{comparison.existing_vertices:,} vertices')
        print(f'  extract: {comparison.staged_areas} {spec.noun}, '
              f'{comparison.staged_vertices:,} vertices')
        print(f'  added {len(comparison.added)}, '
              f'removed {len(comparison.removed)}, '
              f'changed shape {len(comparison.changed)}')

    for warning in assessment.warnings:
        print(f'  ! {warning}')

    # Refusals are printed by whoever catches them, so that a refusal raised by
    # the SQL checks and one raised here read identically.

    if assessment.ok and dry_run:
        print('  would load. Nothing was changed (--dry-run).')


def drop_staging(connection, spec):
    """Clear the staging table away, whatever the transaction decided.

    Rolls back first: every statement on an aborted transaction is an error
    until it is ended.
    """
    connection.rollback()
    with connection.cursor() as cursor:
        cursor.execute(f'DROP TABLE IF EXISTS {spec.staging_table}')
    connection.commit()


def stored_rows(connection, spec) -> int:
    """How many rows the layer is currently serving.

    Asked before a delivery is skipped as unchanged: the load history lives in
    cache.local_layer_loads and the rows live in the layer's own table, so
    dropping or truncating one leaves the other saying the data is loaded.
    That is not hypothetical - the cache schema exists to be rebuilt, and a
    downgrade takes the table while the history survives.
    """
    with connection.cursor() as cursor:
        cursor.execute(f'SELECT count(*) FROM {spec.target_table}')
        return int(cursor.fetchone()[0])


def stored_age_note(connection, spec) -> str:
    """How long the map has been serving what it is serving.

    Said on a refusal: a day old and a month old mean different things.
    """
    previous = last_load(connection, spec, ('loaded',))
    if not previous:
        return 'Nothing has ever been loaded for this layer.'

    age = previous['age_days']
    sentence = (
        f'The stored extract was loaded {age} day{"" if age == 1 else "s"} ago.'
    )
    if age >= STALE_AFTER_DAYS:
        return f'{sentence} The map has been serving it since then.'
    return sentence


def refuse(connection, spec, refusal: RefusedError, source_names: str,
           source_digest: str, comparison=None, rows=None) -> int:
    """Report and record a refusal, and return the exit code for one.

    One function for every way a delivery is turned away, so none of them can
    drift into being quieter than the others. `comparison` and `rows` are None
    where the refusal came before there was a staged extract to describe.
    """
    for reason in refusal.reasons:
        print(f'  REFUSED: {reason}')
    # Rolls back first, then records on a clean transaction: this row is the
    # only trace an unattended run leaves of having gone wrong.
    record(connection, spec, 'refused', source_names, source_digest,
           comparison, rows, {'refusals': refusal.reasons})
    print(f'\nNothing was changed. {stored_age_note(connection, spec)}')
    return EXIT_REFUSED


def local_sources(args, spec) -> tuple:
    """Resolve the files named on the command line, and check they are there."""
    sources = [Path(one).expanduser().resolve() for one in args.source]
    if len(sources) not in (1, len(spec.sources)):
        raise CannotRunError(
            f'{spec.object_name} reads {len(spec.sources)} source layer(s); '
            f'pass --source that many times, in the order '
            f'{[one.name for one in spec.sources]}, or once for a file '
            f'holding them all'
        )

    lyrx_path = Path(args.lyrx).expanduser().resolve() if args.lyrx else None
    for path in sources + ([lyrx_path] if lyrx_path else []):
        if not path.exists():
            raise CannotRunError(f'no such file: {path}')

    return sources, lyrx_path


@contextmanager
def delivery(args, spec):
    """Yield the extract and its .lyrx, however they were come by.

    A download owns a temporary directory for the life of the load. tempfile
    honours TMPDIR, which the CronJob points at its emptyDir. Cleared even on
    failure, or a Job failing every morning fills the volume;
    --keep-download is the escape hatch.
    """
    if not args.from_s3:
        yield local_sources(args, spec)
        return

    directory = Path(tempfile.mkdtemp(prefix='ingest-'))
    try:
        fetched = fetch(spec, directory)
        yield fetched.sources, fetched.lyrx
    finally:
        if args.keep_download:
            print(f'  left the download in {directory}')
        else:
            shutil.rmtree(directory, ignore_errors=True)


def load(args, spec, sources: list, lyrx_path, connection, target) -> int:
    """Do the work, once the lock is held. Returns the exit code."""
    # Checked before anything is read, so being invoked without a .lyrx is a
    # usage error whether or not the delivery turns out to be unchanged.
    if lyrx_path is None and not spec.owns_style:
        raise CannotRunError(f'--lyrx is required for {spec.object_name}')

    source_names = ', '.join(path.name for path in sources)
    # The .lyrx hashes with the extract: a delivery whose symbology changed is a
    # delivery that changed. For a layer whose style is ours, the style itself
    # hashes in for the same reason - nothing in the delivery moves when it
    # changes. See digest().
    source_digest = digest([*sources] + ([lyrx_path] if lyrx_path else []),
                           owned_style_digest(spec))
    previous = last_load(connection, spec, ('loaded',))
    # Unchanged bytes are only a reason to stop if the rows they produced are
    # still there. Skipping on the digest alone would leave an emptied table
    # empty for as long as the delivery stayed the same.
    unchanged = previous.get('digest') == source_digest
    if unchanged and not args.force and stored_rows(connection, spec) > 0:
        # Most scheduled runs land here: nothing changed upstream.
        print(f'  {source_names} is byte-for-byte what is already loaded; '
              f'nothing to do.')
        if not args.dry_run:
            record(connection, spec, 'skipped', source_names, source_digest)
        return EXIT_OK

    if unchanged and not args.force:
        print(f'  {source_names} is unchanged, but {spec.target_table} is '
              f'empty; loading it again.')

    # After the digest check, so a bad .lyrx is reported on the runs where it
    # would change what is drawn, not every morning.
    print('Building the style ...' if spec.owns_style
          else f'Translating {lyrx_path.name} ...')
    try:
        style, manifest = build_style(spec, lyrx_path)
    except RefusedError as refusal:
        return refuse(connection, spec, refusal, source_names, source_digest)

    staging = ', '.join(
        f'{path.name}:{source.name}'
        for path, source in zip(source_paths(spec, sources), spec.sources)
    )
    mode = ogr.resolve_mode(args.gdal)
    print(f'Staging {staging} (ogr2ogr: {mode}) ...')
    staged_seconds = stage(spec, sources, target, mode)
    print(f'  ogr2ogr: {staged_seconds:.1f}s')

    with connection.cursor() as cursor:
        print('Checking the extract ...')
        comparison = None
        rows = None
        try:
            validate(cursor, spec)

            rows = staged_rows(cursor, spec)
            comparison = compare(cursor, spec)
            coverage = check_style_against(cursor, spec, manifest)
            assessment = assess(
                comparison, coverage, noun=spec.noun,
                min_ratio=args.min_ratio, allow_shrink=args.allow_shrink,
            )
            report(spec, comparison, assessment, args.dry_run)

            if not assessment.ok:
                raise RefusedError(assessment.refusals)
        except RefusedError as refusal:
            return refuse(connection, spec, refusal, source_names,
                          source_digest, comparison, rows)

        if args.dry_run:
            connection.rollback()
            return EXIT_OK

        print('Replacing the stored extract ...')
        started = time.monotonic()
        # Before the transform, which truncates what it is about to replace.
        if spec.track_history:
            capture_previous(cursor, spec)
        run_sql_file(cursor, spec, 'transform.sql')
        write_style(cursor, spec, style, manifest)
        print(f'  transform: {time.monotonic() - started:.1f}s')

        # Inside the transaction: a load that rolls back changed nothing, so
        # it has nothing to have recorded.
        if spec.track_history:
            changes = write_feature_history(
                cursor, spec, source_names, source_digest)
            print(describe_changes(changes))
            # What the transform actually did, which is more than the staged
            # comparison can see: that one runs before the transform and
            # matches on the label, so an attribute-only fix is invisible to
            # it. 168 of them in the 16/10/2026 delivery.
            comparison.added_count = changes['added']
            comparison.removed_count = changes['removed']
            comparison.changed_count = changes['changed']

    connection.commit()
    print('  committed.')

    record(connection, spec, 'loaded', source_names, source_digest, comparison,
           rows, {
               'warnings': assessment.warnings,
               'unmatchedNames': coverage.unmatched,
               'allowShrink': args.allow_shrink,
           })

    # Autocommit, because VACUUM cannot run inside a transaction block.
    # transform.sql replaces the rows with DELETE rather than TRUNCATE, so that
    # readers are not locked out for the length of a load; the dead row and
    # geometry that leaves behind per area are reclaimed here rather than left
    # for autovacuum to find some minutes later. ANALYZE comes with it, being
    # useless inside a transaction anyway.
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'VACUUM (ANALYZE) {spec.target_table}')
    finally:
        connection.autocommit = False
    return EXIT_OK


def attempted_name(args, spec) -> str:
    """Name the source in a history row written before there was one.

    source_name is NOT NULL and a failure can precede any file, so this records
    what was asked for rather than what arrived.
    """
    if args.from_s3 and spec.s3:
        return ', '.join(spec.s3.sources)
    if args.source:
        return ', '.join(Path(one).name for one in args.source)
    return spec.object_name


def describe_db_error(error) -> str:
    """One line about a database error, for stderr and the history row.

    psycopg2's str() carries the failing statement and a caret into it, which
    is SQL this repository already holds. The message and SQLSTATE identify it.
    """
    diag = getattr(error, 'diag', None)
    primary = (getattr(diag, 'message_primary', None) or str(error)).strip()
    code = getattr(error, 'pgcode', None)
    return f'{primary} (SQLSTATE {code})' if code else primary


def database_url(args) -> str:
    """Where to load, from the flag or from the environment the API reads.

    The fallback lets the CronJob reuse the Deployment's DATABASE_* keys
    rather than assembling a URL in YAML.
    """
    if args.database_url:
        return args.database_url

    config = get_ingest_config()
    if not config.DB_HOST:
        raise CannotRunError(
            'no database configured: pass --database-url, or set DATABASE_URL, '
            'or set DATABASE_HOST and the rest of the DATABASE_* environment'
        )
    return config.SQLALCHEMY_DATABASE_URI


def main():
    """Stage, check, and either replace the stored extract or refuse to."""
    args = parse_args()
    spec = INGEST_SPECS[args.layer]

    # Checked here rather than by argparse so the message can say what to do.
    if args.from_s3 and args.source:
        print('pass --from-s3 or --source, not both: --from-s3 already knows '
              'which keys this layer is delivered as', file=sys.stderr)
        return EXIT_FAILED
    if not args.from_s3 and not args.source:
        print('pass --source for files that are already here, or --from-s3 to '
              'fetch the delivery', file=sys.stderr)
        return EXIT_FAILED
    if args.from_s3 and args.lyrx:
        # Refused rather than ignored. The fetched .lyrx would win, and a load
        # that silently used a different symbology from the one named on the
        # command line is exactly the kind of quiet wrongness this script exists
        # to avoid.
        print('--lyrx has no meaning with --from-s3: the .lyrx is fetched from '
              'the key the spec names. Drop one of the two.', file=sys.stderr)
        return EXIT_FAILED

    # Here rather than at the top of the file, for the reason connect() gives:
    # --help and the argument checks above work without the venv's
    # dependencies. Past this line the load needs a database anyway, and the
    # except clause below has to be able to name psycopg2's base error.
    import psycopg2  # pylint: disable=import-outside-toplevel

    connection = None
    # Whether this run owns the staging table, which is what decides below
    # whether it may clear it away.
    locked = False
    try:
        target = target_from_url(database_url(args))
        connection = connect(target)

        if not take_lock(connection, spec):
            # A previous run is still going, and by the time this one had the
            # lock it would be loading the same file. Before the download, so
            # it does not spend 74MB on a file it will throw away.
            print('another load of this layer is already running; nothing to do.')
            return EXIT_OK
        locked = True

        with delivery(args, spec) as (sources, lyrx_path):
            return load(args, spec, sources, lyrx_path, connection, target)
    except (CannotRunError, psycopg2.Error) as problem:
        # A database error is a failure, not a refusal. validate() turns the
        # deliberate raises into refusals; anything else - a value too long, a
        # drifted type, a dropped connection - is the ingest breaking. Left to
        # escape these exited 1 and wrote no history row at all.
        detail = (describe_db_error(problem)
                  if isinstance(problem, psycopg2.Error) else str(problem))
        print(f'could not run: {detail}', file=sys.stderr)
        if connection is not None:
            # The one trace an unattended failure leaves where someone will
            # look. A failure before the connection cannot be recorded, which
            # is fine: there is no database to read it from either.
            try:
                record(connection, spec, 'failed', attempted_name(args, spec), None,
                       notes={'error': detail})
            except Exception as also:  # noqa: B902 # pylint: disable=broad-except
                # Never let recording the failure replace it.
                print(f'could not record the failure either: {also}', file=sys.stderr)
        return EXIT_FAILED
    finally:
        if connection is not None:
            try:
                # Only the lock holder may do this: a hand-started run
                # dropping the table would, between ogr2ogr committing and the
                # checks locking it, leave the real load reading nothing.
                if locked:
                    drop_staging(connection, spec)
            except Exception as cleanup:  # noqa: B902 # pylint: disable=broad-except
                # Best effort, never allowed to escape. A dead connection
                # cannot be rolled back, and raising from a `finally` would
                # discard the exit code the handler chose - turning a correct
                # exit 2 into a traceback and exit 1. The staging table is
                # disposable and the next -overwrite reclaims it.
                print(f'could not clear the staging table away: {cleanup}',
                      file=sys.stderr)
            finally:
                # psycopg2 allows this on an already-closed connection, so it
                # needs no guard of its own.
                connection.close()


if __name__ == '__main__':
    sys.exit(main())
