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

Some layers live in the BC Geographic Warehouse, which this application cannot
reach directly, so EAO exports them for us: the features as a GeoPackage (or a
set of shapefiles), and the symbology as a .lyrx beside them, because no GIS
interchange format carries both.

This runs on a schedule, unattended, against a database that already holds a
good copy - so it is built to refuse rather than to overwrite. Staging the new
rows, checking them, replacing the old ones and storing the style all happen in
one transaction: if anything is wrong the transaction rolls back and the
previous load is still there, untouched.

Because nobody is watching, a refusal cannot just be printed. Every attempt is
recorded in cache.local_layer_loads, refusals included, on a connection that
outlives the rolled-back transaction - otherwise a bad extract would leave no
trace at all and the map would quietly serve last month's boundaries. A refusal
also exits non-zero and says how old the stored extract has become, so a
scheduler that reports failures has something to report.

What differs between layers - which SQL to run, what a row is called, which
geometry type ogr2ogr should promote to, and which advisory lock to take - is
in local_layer_service/ingest_spec.py rather than here. Everything in this file
is true of every layer.

  make ingest-local-layer LAYER=pip SOURCE=... LYRX=...          load a file
  make ingest-local-layer-dry-run LAYER=pip SOURCE=... LYRX=...  say what it would do
  make ingest-pip-s3                                             load the delivery
  make ingest-pip-s3-dry-run                                     say what it would do

Two ways in, one load. --source takes files that are already here, which is what
a developer rehearsing a change does. --from-s3 fetches the keys the layer's
spec names, which is what the CronJob does every morning. They meet immediately:
past the download this is one code path, so the load that was rehearsed is the
load that runs.

Exit codes, which are the scheduler's side of the conversation:

  0  loaded, or nothing to do
  1  the extract was refused - a data problem, needs a person to look at the file
  2  the ingest could not run - a system problem, needs a person to look at us

Keeping those two apart is most of the point. A refusal is the guard working;
a failure is the guard never having run.

GDAL is not a dependency of this repository, so a laptop runs ogr2ogr from a
pinned container. A pod cannot start a container, so the scheduled ingest runs
on an image built FROM that same pinned tag - see map-api/Dockerfile.ingest, and
local_layer_service/ogr.py for the switch and for what the two calls have in
common, which is everything but the paths.
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
# Style documents for layers whose palette is decided here rather than in ArcGIS.
STYLE_DIR = (
    SCRIPT_DIR.parent / 'src' / 'map_api' / 'services' / 'local_layer_service' /
    'styles'
)

# Importable once this is on the path: the .lyrx translation, the per-layer
# descriptors and the rules for whether a staged extract may replace the stored
# one all live with the service that serves them.
sys.path.insert(0, str(SCRIPT_DIR.parent / 'src'))

# pylint: disable=wrong-import-position
from map_api.config import get_ingest_config  # noqa: E402,I005
from map_api.services.local_layer_service import ogr  # noqa: E402
from map_api.services.local_layer_service.ingest import (  # noqa: E402
    DEFAULT_MIN_RATIO, NO_STYLE_COVERAGE, CannotRunError, LoadComparison,
    StyleCoverage, assess)
from map_api.services.local_layer_service.ingest_spec import INGEST_SPECS  # noqa: E402
from map_api.services.local_layer_service.lyrx import unique_value_paint  # noqa: E402
from map_api.services.local_layer_service.s3 import fetch  # noqa: E402


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
                        help='fetch the keys this layer\'s spec names from '
                             'object storage, instead of passing --source')
    parser.add_argument('--lyrx',
                        help='the ArcGIS layer file carrying the symbology. '
                             'Required for a layer styled from one, unless it '
                             'is being fetched with --from-s3')
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
    """The database to load, with its credentials as they actually are.

    urlparse does not percent-decode, and db_uri() percent-encodes - so a
    generated password containing @ / : or % arrives here as '%40' and
    authenticates as the literal characters. Decoding once, here, is what stops
    the same mistake being made twice: psycopg2 takes these and so does the DSN
    ogr2ogr is handed.
    """

    host: str
    port: int
    user: str
    password: str
    dbname: str


def target_from_url(database_url: str) -> PgTarget:
    """Read a connection target out of a postgresql:// URL."""
    parsed = urlparse(database_url)
    if not parsed.hostname:
        raise CannotRunError(f'could not read a host out of {database_url!r}')

    return PgTarget(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=unquote(parsed.username or ''),
        password=unquote(parsed.password or ''),
        dbname=unquote((parsed.path or '').lstrip('/')),
    )


def pg_dsn(target: PgTarget) -> str:
    """Build the PG: string for ogr2ogr, quoted the way libpq expects.

    Keyword/value syntax, not a URL: a value containing a space ends the field
    unless it is quoted, and a backslash or a single quote inside one has to be
    escaped or the whole DSN is misread. Quoting everything is simpler than
    deciding which values need it.
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

    A database that will not answer is a CannotRunError, not a traceback. Left to
    psycopg2 it would exit 1 - the code that means a bad extract arrived - and
    send whoever reads the Job looking at the file rather than at the database.
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


def stage(spec, sources: list, target: PgTarget, mode: str) -> float:
    """Load the extract into the staging table with ogr2ogr.

    Runs on its own connection, outside the transaction below, because it is a
    separate process. That is safe: the staging table is disposable, and
    nothing it writes is visible to the map until the transaction commits.

    One call per source layer. The first overwrites and the rest append, so a
    layer delivered as three shapefiles lands in the same staging table as one
    delivered as a three-layer GeoPackage, and everything downstream of here
    cannot tell the difference.

    How ogr2ogr is reached - directly, or through the pinned container - is
    ogr.py's business, and the two differ only in the paths they name.
    """
    dsn = pg_dsn(target)
    sql_dir = SQL_ROOT / spec.sql_dir
    build = ogr.command_for(mode)

    started = time.monotonic()
    for index, (source, source_layer) in enumerate(zip(sources, spec.sources)):
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

    A scheduled job that overruns its interval meets the next one part way
    through, and both would be writing the same staging table. Whoever arrives
    second does nothing rather than queueing: by the time it got the lock its
    extract would be the same file the first one is already loading.

    The key is the layer's, not the script's. A key shared between layers would
    make a PIP load that overlaps a components load look, to the second one,
    exactly like a second copy of itself - and it would exit 0 having loaded
    nothing.
    """
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(%s)', (spec.lock_key,))
        return bool(cursor.fetchone()[0])


def digest(paths: list) -> str:
    """Hash the extract, to recognise a republish of the same file.

    The scheduler fetches whether or not anything changed upstream, so most
    runs are handed a file that is byte-for-byte what is already loaded.
    Hashing 74MB costs a fraction of a second and saves the whole transform.

    Several files hash as one, in the order the spec lists them, with the name
    and length of each mixed in - so a layer delivered as three shapefiles is
    recognised as unchanged only when all three are.
    """
    import hashlib  # pylint: disable=import-outside-toplevel

    digester = hashlib.sha256()
    for path in paths:
        digester.update(f'{path.name}:{path.stat().st_size}\0'.encode('utf-8'))
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b''):  # noqa: B023
                digester.update(block)
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

    Separate on purpose. A refusal has just rolled back everything it touched,
    and the record of that refusal is the one thing that must survive it -
    otherwise the only evidence a scheduled run went wrong is a log line
    nobody is reading.
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
            len(comparison.added) if comparison else 0,
            len(comparison.removed) if comparison else 0,
            len(comparison.changed) if comparison else 0,
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

    The checks raise, which is what aborts the transaction and protects the
    stored extract. That is the expected outcome for a bad file rather than a
    crash, so it comes back as a sentence about the file rather than a
    traceback about psycopg2.
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

    Runs before anything is written, so the target table still holds the
    previous load and both sides are readable in the same breath.
    """
    # A layer whose extract is a flattened join carries one geometry once per
    # joined row, so it is counted one per key; one that does not is counted as
    # it comes. Folding a layer that needs no folding would be harmless but
    # slower, and not folding one that needs it would count the same area
    # nineteen times.
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

    # Compared by name rather than id: a name is what a person reading the
    # report can recognise, and the validation has already established that the
    # two identify each other.
    cursor.execute(f"""
        WITH staged AS ({staged_source}),
        stored AS (
            SELECT {identity.label} AS name, md5(ST_AsBinary(geom)) AS shape
            FROM {spec.target_table}
        ),
        staged_shapes AS (
            SELECT name, md5(ST_AsBinary(geom)) AS shape FROM staged
        )
        SELECT
            array(SELECT name FROM staged_shapes EXCEPT SELECT name FROM stored ORDER BY 1),
            array(SELECT name FROM stored EXCEPT SELECT name FROM staged_shapes ORDER BY 1),
            array(SELECT s.name FROM staged_shapes s JOIN stored p USING (name)
                  WHERE s.shape <> p.shape ORDER BY 1)
    """)
    comparison.added, comparison.removed, comparison.changed = cursor.fetchone()
    return comparison


def build_style(spec, lyrx_path) -> tuple:
    """Produce the MapLibre style for this layer, before any of it is stored.

    Either translated from the delivered .lyrx or read from a style document in
    this repository, depending on where the layer's symbology is decided. Both
    produce the same shape, and nothing downstream - the style row, the
    endpoint, the client - can tell which it was handed.
    """
    mvt_layer = _mvt_layer(spec)

    if spec.style.kind == 'lyrx':
        if lyrx_path is None:
            raise CannotRunError(f'--lyrx is required for {spec.object_name}')
        document = json.loads(lyrx_path.read_text(encoding='utf-8'))
        definitions = document.get('layerDefinitions') or []
        if not definitions:
            raise CannotRunError(f'{lyrx_path} carries no layer definitions')
        style, manifest = unique_value_paint(definitions[0])
        return _name_source_layers(style, mvt_layer), manifest

    if spec.style.kind == 'spec':
        path = STYLE_DIR / spec.style.path
        style = json.loads(path.read_text(encoding='utf-8'))
        # No classes, so nothing for the coverage check to match. The manifest
        # records where the palette came from instead, so the load history can
        # answer which one is on the map.
        manifest = {'source': 'spec', 'path': spec.style.path,
                    'digest': digest([path])}
        return _name_source_layers(style, mvt_layer), manifest

    raise CannotRunError(f'unknown style source {spec.style.kind!r}')


def _name_source_layers(style: dict, mvt_layer: str) -> dict:
    """Fill in the MVT layer name on every layer spec that left it open.

    A style document says how to draw, not where from, so the name of the layer
    inside the tile is the ingest's to supply - and a document that names one
    explicitly, as a multi-geometry layer's will, is left alone.
    """
    for spec_layer in style['layers']:
        if spec_layer.get('sourceLayer') is None:
            spec_layer['sourceLayer'] = mvt_layer
    return style


def _mvt_layer(spec) -> str:
    """Return the layer name inside the vector tile, from the serving registry.

    Read from there rather than repeated here, so the tile SQL and the client's
    source-layer cannot drift apart.
    """
    from map_api.services.local_layer_service import LOCAL_LAYERS  # pylint: disable=import-outside-toplevel

    return LOCAL_LAYERS[spec.object_name].mvt_layer


def check_style_against(cursor, spec, manifest: dict) -> StyleCoverage:
    """Measure which staged values the style covers, and which it does not.

    Uncheckable where the spec says so: a style read from a document in this
    repository has no classes to match, and running the guard against it would
    refuse every load.
    """
    column = spec.style.coverage_column
    if column is None:
        return NO_STYLE_COVERAGE

    cursor.execute(f'SELECT DISTINCT {column} FROM {spec.staging_table}')
    names = {row[0] for row in cursor.fetchall()}
    classes = set(manifest['classes'])
    return StyleCoverage(
        unmatched=sorted(names - classes), matched=len(classes & names),
    )


def write_style(cursor, spec, style: dict, manifest: dict):
    """Replace this layer's style row, inside the load's transaction.

    source_layer and min_zoom are columns as well as being in the document, so
    the row can be read without parsing the JSON. They come off the first layer
    spec and the source, which is what a single-layer style has anyway.
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

    Rolls back first: a refusal leaves the transaction aborted, and every
    statement on an aborted transaction is an error until it is ended.
    """
    connection.rollback()
    with connection.cursor() as cursor:
        cursor.execute(f'DROP TABLE IF EXISTS {spec.staging_table}')
    connection.commit()


def stored_age_note(connection, spec) -> str:
    """How long the map has been serving what it is serving.

    Said on a refusal, because that is the moment it matters: the ingest has
    just declined to replace the stored extract, and whether that extract is a
    day old or a month old is the difference between "fine, try tomorrow" and
    "somebody needs to look at this now".
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


def local_sources(args, spec) -> tuple:
    """Resolve the files named on the command line, and check they are there."""
    sources = [Path(one).expanduser().resolve() for one in args.source]
    if len(sources) != len(spec.sources):
        raise CannotRunError(
            f'{spec.object_name} reads {len(spec.sources)} source layer(s); '
            f'pass --source that many times, in the order '
            f'{[one.name for one in spec.sources]}'
        )

    lyrx_path = Path(args.lyrx).expanduser().resolve() if args.lyrx else None
    for path in sources + ([lyrx_path] if lyrx_path else []):
        if not path.exists():
            raise CannotRunError(f'no such file: {path}')

    return sources, lyrx_path


@contextmanager
def delivery(args, spec):
    """Yield the extract and its .lyrx, however they were come by.

    A download owns a temporary directory for exactly as long as the load needs
    it. tempfile honours TMPDIR, which is what the CronJob points at its
    emptyDir - a 74MB GeoPackage does not belong on a pod's writable layer.

    Cleared away even when the load fails, because a Job that fails every
    morning would otherwise fill the volume and turn a legible refusal into an
    illegible one. --keep-download is the escape hatch for looking at what
    actually arrived.
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
    if spec.style.kind == 'lyrx':
        print(f'Translating {lyrx_path.name} ...')
    else:
        print(f'Reading the style from {spec.style.path} ...')
    style, manifest = build_style(spec, lyrx_path)

    source_names = ', '.join(path.name for path in sources)
    source_digest = digest(sources)
    previous = last_load(connection, spec, ('loaded',))
    if previous.get('digest') == source_digest and not args.force:
        # Most scheduled runs land here: the upstream file has not changed
        # since the last one, so there is nothing to do and nothing to risk.
        print(f'  {source_names} is byte-for-byte what is already loaded; '
              f'nothing to do.')
        if not args.dry_run:
            record(connection, spec, 'skipped', source_names, source_digest)
        return EXIT_OK

    staging = ', '.join(
        f'{path.name}:{source.name}'
        for path, source in zip(sources, spec.sources)
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
            for reason in refusal.reasons:
                print(f'  REFUSED: {reason}')
            # Rolls back first, then records on a clean transaction: this row
            # is the only trace an unattended run leaves of having gone wrong.
            record(connection, spec, 'refused', source_names, source_digest,
                   comparison, rows, {'refusals': refusal.reasons})
            print(f'\nNothing was changed. {stored_age_note(connection, spec)}')
            return EXIT_REFUSED

        if args.dry_run:
            connection.rollback()
            return EXIT_OK

        print('Replacing the stored extract ...')
        started = time.monotonic()
        run_sql_file(cursor, spec, 'transform.sql')
        write_style(cursor, spec, style, manifest)
        print(f'  transform: {time.monotonic() - started:.1f}s')

    connection.commit()
    print('  committed.')

    record(connection, spec, 'loaded', source_names, source_digest, comparison,
           rows, {
               'warnings': assessment.warnings,
               'unmatchedNames': coverage.unmatched,
               'allowShrink': args.allow_shrink,
           })

    with connection.cursor() as cursor:
        # Outside the transaction: ANALYZE inside one does nothing useful.
        cursor.execute(f'ANALYZE {spec.target_table}')
    connection.commit()
    return EXIT_OK


def attempted_name(args, spec) -> str:
    """What to call the source in a history row written before there was one.

    source_name is NOT NULL, and a failure can happen before any file exists to
    name - so it records what was asked for rather than what arrived.
    """
    if args.from_s3 and spec.s3:
        return ', '.join(spec.s3.sources)
    if args.source:
        return ', '.join(Path(one).name for one in args.source)
    return spec.object_name


def database_url(args) -> str:
    """Where to load, from the flag or from the environment the API reads.

    The fallback is what lets the CronJob reuse the Deployment's DATABASE_*
    secret keys verbatim, instead of assembling a URL in YAML.
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

    connection = None
    try:
        target = target_from_url(database_url(args))
        connection = connect(target)

        if not take_lock(connection, spec):
            # A previous run is still going. Doing nothing is right: by the
            # time this one got the lock it would be loading the same file.
            # Checked before the download, so an overlapping run does not spend
            # 74MB of transfer on a file it is about to throw away.
            print('another load of this layer is already running; nothing to do.')
            return EXIT_OK

        with delivery(args, spec) as (sources, lyrx_path):
            return load(args, spec, sources, lyrx_path, connection, target)
    except CannotRunError as problem:
        print(f'could not run: {problem}', file=sys.stderr)
        if connection is not None:
            # The one trace an unattended failure leaves in the place someone
            # asking "why is the map serving last week's boundaries" will look.
            # A failure before the connection cannot be recorded at all, and
            # that is acceptable: there is no database to read the answer out of
            # either, and the failed Job is the record.
            try:
                record(connection, spec, 'failed', attempted_name(args, spec), None,
                       notes={'error': str(problem)})
            except Exception as also:  # pylint: disable=broad-except
                # Never let the record of a failure replace the failure. If the
                # database is what broke, this is the second symptom, not the
                # story.
                print(f'could not record the failure either: {also}', file=sys.stderr)
        return EXIT_FAILED
    finally:
        if connection is not None:
            try:
                drop_staging(connection, spec)
            finally:
                connection.close()


if __name__ == '__main__':
    sys.exit(main())
