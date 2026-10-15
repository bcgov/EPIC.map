# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Tests for the parts of the ingest script that decide, rather than do.

Both decisions are silent when they go wrong: whether a delivery is the one
already loaded, which makes most scheduled runs do nothing, and whether a
.lyrx that will not translate is a refusal or a crash. A crash exits 1 by
accident and writes no history row at all.

Loaded by path because the script is not importable: it lives in scripts/ and
puts src/ on sys.path itself. test_ingest_spec.py reads Dockerfile.ingest the
same way.
"""

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import psycopg2
import pytest

from map_api.services.local_layer_service.ingest_spec import PIP_CONSULTATION_AREAS


API_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = API_ROOT / 'scripts' / 'ingest_local_layer.py'


def load_script():
    """Import the ingest script from its path, without running it."""
    spec = importlib.util.spec_from_file_location('ingest_local_layer', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ingest = load_script()


def write(directory: Path, name: str, content: str) -> Path:
    """Put one file in place and return its path."""
    path = directory / name
    path.write_text(content, encoding='utf-8')
    return path


# Shaped like the delivered one: a unique value renderer over one string
# field, one class, a solid stroke.
def lyrx_document(colour=(0, 0, 0), field='CNSLTN_AREA_NAME') -> dict:
    """Build the smallest .lyrx the translator accepts."""
    return {
        'layerDefinitions': [{
            'renderer': {
                'type': 'CIMUniqueValueRenderer',
                'fields': [field],
                'groups': [{
                    'classes': [{
                        'values': [{'fieldValues': ['Tsleil-Waututh Nation']}],
                        'symbol': {'symbol': {'symbolLayers': [{
                            'type': 'CIMSolidStroke',
                            'width': 3,
                            'color': {'type': 'CIMRGBColor',
                                      'values': [*colour, 100]},
                        }]}},
                    }],
                }],
            },
        }],
    }


class TestDigest:
    """What counts as the delivery already loaded."""

    def test_the_same_files_hash_the_same(self, tmp_path):
        """Otherwise every scheduled run would reload an unchanged delivery."""
        extract = write(tmp_path, 'PIP.gpkg', 'boundaries')
        lyrx = write(tmp_path, 'PIP.lyrx', 'symbology')

        assert ingest.digest([extract, lyrx]) == ingest.digest([extract, lyrx])

    def test_a_symbology_only_re_export_is_a_change(self, tmp_path):
        """A corrected colour table against the same geometry.

        Hashing the extract alone calls this unchanged, records 'skipped', and
        the new colours never reach the map.
        """
        extract = write(tmp_path, 'PIP.gpkg', 'boundaries')
        before = ingest.digest([extract, write(tmp_path, 'PIP.lyrx', 'old')])
        after = ingest.digest([extract, write(tmp_path, 'PIP.lyrx', 'new')])

        assert before != after

    def test_an_extract_only_re_export_is_a_change(self, tmp_path):
        """The other half: new boundaries under the same symbology."""
        lyrx = write(tmp_path, 'PIP.lyrx', 'symbology')
        before = ingest.digest([write(tmp_path, 'PIP.gpkg', 'old'), lyrx])
        after = ingest.digest([write(tmp_path, 'PIP.gpkg', 'new'), lyrx])

        assert before != after

    def test_dropping_the_lyrx_from_the_hash_is_a_different_answer(self, tmp_path):
        """Names and lengths are mixed in, so a file cannot be left out silently."""
        extract = write(tmp_path, 'PIP.gpkg', 'boundaries')
        lyrx = write(tmp_path, 'PIP.lyrx', 'symbology')

        assert ingest.digest([extract]) != ingest.digest([extract, lyrx])

    def test_a_rename_is_a_change(self, tmp_path):
        """The filename is part of the hash: two deliveries, not one republished."""
        first = write(tmp_path, 'PIP.gpkg', 'boundaries')
        second = write(tmp_path, 'PIP_CONSULTATION_AREAS.gpkg', 'boundaries')

        assert ingest.digest([first]) != ingest.digest([second])


class TestBuildStyle:
    """What a .lyrx the ingest cannot use is worth."""

    def test_a_translatable_lyrx_produces_a_style(self, tmp_path):
        """The baseline the refusals below are measured against."""
        path = write(tmp_path, 'PIP.lyrx', json.dumps(lyrx_document()))

        style, manifest = ingest.build_style(PIP_CONSULTATION_AREAS, path)

        assert manifest['field'] == 'cnsltn_area_name'
        assert manifest['classes'] == ['Tsleil-Waututh Nation']
        # The ingest fills the MVT layer name in from the serving registry, so
        # the tile SQL and the client cannot drift from it.
        assert style['layers'][0]['sourceLayer'] == 'pip_consultation_areas'

    def test_a_lyrx_that_is_not_json_is_refused(self, tmp_path):
        """A truncated download is a bad file, not a broken ingest."""
        path = write(tmp_path, 'PIP.lyrx', '{"layerDefinitions": [')

        with pytest.raises(ingest.RefusedError) as refusal:
            ingest.build_style(PIP_CONSULTATION_AREAS, path)

        assert 'PIP.lyrx' in str(refusal.value)

    def test_a_lyrx_with_no_layer_definitions_is_refused(self, tmp_path):
        """Valid JSON that carries no renderer is still the wrong file."""
        path = write(tmp_path, 'PIP.lyrx', json.dumps({'layerDefinitions': []}))

        with pytest.raises(ingest.RefusedError):
            ingest.build_style(PIP_CONSULTATION_AREAS, path)

    def test_an_untranslatable_renderer_is_refused(self, tmp_path):
        """The likely one: the renderer changes in ArcGIS and the export follows.

        A refusal, not an UnsupportedRendererError: otherwise the script exits
        1 on a traceback and records nothing.
        """
        document = lyrx_document()
        document['layerDefinitions'][0]['renderer']['type'] = 'CIMSimpleRenderer'
        path = write(tmp_path, 'PIP.lyrx', json.dumps(document))

        with pytest.raises(ingest.RefusedError) as refusal:
            ingest.build_style(PIP_CONSULTATION_AREAS, path)

        assert 'cannot be translated' in str(refusal.value)

    def test_being_invoked_without_a_lyrx_is_not_a_refusal(self):
        """Nothing arrived to judge, so the thing to look at is the invocation."""
        with pytest.raises(ingest.CannotRunError):
            ingest.build_style(PIP_CONSULTATION_AREAS, None)


# A stand-in for the database, built to the statements load() and main() issue,
# recording what was asked so a test can assert on the history row a refusal or
# a failure leaves behind.


class StageCalledError(Exception):
    """Raised instead of running ogr2ogr.

    Lets a test say whether a delivery was loaded without a GeoPackage, a GDAL
    or a staging table: the skip decision is upstream of all three.
    """


class FakeCursor:
    """The cursor protocol load() uses: a context manager, execute, fetch."""

    def __init__(self, connection):
        """Hold the connection, which is where the scripted answers live."""
        self.connection = connection

    def __enter__(self):
        """Usable as `with connection.cursor() as cursor`."""
        return self

    def __exit__(self, *exc_info):
        """Never swallow an exception."""
        return False

    def execute(self, sql, params=None):
        """Record the statement and let the connection script the answer."""
        self.connection.run(sql, params)

    def fetchone(self):
        """Return the row the last statement was scripted to answer with."""
        return self.connection.row

    def fetchall(self):
        """Return the rows the last statement was scripted to answer with."""
        return self.connection.rows


class FakeConnection:
    """A database that answers the ingest's statements from a script.

    `previous` is the load-history row for this layer, or None. `fail_on` names
    a fragment of SQL that raises `error` instead of answering.

    `dies` makes that failure the connection's last act, as a dropped
    connection is: every later call, rollback included, raises InterfaceError.
    Without it the cleanup path reads as working when it does not.
    """

    def __init__(self, previous=None, fail_on=None, error=None,
                 existing=(0, 0), dies=False):
        """Script the answers, and start with an empty history."""
        self.previous = previous
        self.fail_on = fail_on
        self.error = error
        self.existing = existing
        self.dies = dies
        self.dead = False
        # Every row written to cache.local_layer_loads, as the params tuple.
        self.history = []
        self.statements = []
        self.row = None
        self.rows = []
        self.closed = False
        self.autocommit = True

    def cursor(self):
        """Hand out a fresh cursor, as psycopg2 does."""
        return FakeCursor(self)

    def _alive(self):
        """Refuse everything once the connection has gone, as psycopg2 does."""
        if self.dead:
            raise psycopg2.InterfaceError('connection already closed')

    def run(self, sql, params=None):
        """Answer one statement, or raise where the test asked for a failure."""
        self._alive()
        flat = ' '.join(str(sql).split())
        self.statements.append(flat)

        if self.fail_on and self.fail_on in flat:
            self.dead = self.dies
            raise self.error

        self.row, self.rows = None, []
        if 'pg_try_advisory_lock' in flat:
            self.row = (True,)
        elif 'FROM cache.local_layer_loads' in flat:
            self.row = self.previous
        elif 'INSERT INTO cache.local_layer_loads' in flat:
            self.history.append(params)
        elif 'count(DISTINCT key)' in flat:
            self.row = (1, 100)
        elif 'count(*), coalesce' in flat:
            self.row = self.existing
        elif 'SELECT count(*) FROM cache.pip_consultation_areas_src' in flat:
            self.row = (1,)
        elif 'SELECT DISTINCT cnsltn_area_name' in flat:
            self.rows = [('Tsleil-Waututh Nation',)]

    def rollback(self):
        """Record the rollback, which record() depends on being able to do."""
        self._alive()
        self.statements.append('ROLLBACK')

    def commit(self):
        """Record the commit, so a test can tell a load from a rollback."""
        self._alive()
        self.statements.append('COMMIT')

    def close(self):
        """Record the close, so a test can assert the connection was let go."""
        self.closed = True

    @property
    def statuses(self):
        """The status of every history row, in the order they were written."""
        return [row[1] for row in self.history]

    def notes(self, index=0):
        """Decode the notes blob of one history row."""
        return json.loads(self.history[index][10])


TARGET = ingest.PgTarget(host='localhost', port=5432, user='map',
                         password='map', dbname='map-db')


def make_args(**overrides):
    """Build the argparse namespace load() reads, with the defaults it sees."""
    args = {
        'layer': 'pip', 'source': None, 'from_s3': False, 'lyrx': None,
        'gdal': 'auto', 'keep_download': False, 'database_url': None,
        'dry_run': False, 'allow_shrink': False, 'force': False,
        'min_ratio': ingest.DEFAULT_MIN_RATIO,
    }
    args.update(overrides)
    return argparse.Namespace(**args)


def delivery_files(directory, lyrx_document_=None):
    """Write a delivery - an extract and the .lyrx beside it - and return both."""
    extract = write(directory, 'PIP.gpkg', 'boundaries')
    document = lyrx_document() if lyrx_document_ is None else lyrx_document_
    lyrx = write(directory, 'PIP.lyrx', json.dumps(document))
    return extract, lyrx


def no_staging(monkeypatch):
    """Make reaching ogr2ogr an observable event rather than a subprocess."""
    def refuse_to_stage(*_args, **_kwargs):
        raise StageCalledError()
    monkeypatch.setattr(ingest, 'stage', refuse_to_stage)


class TestLoadSkipsAnUnchangedDelivery:
    """The decision that makes most scheduled runs do nothing.

    Through load(), not digest() alone: the bug was in the call site, which a
    test hashing its own list cannot see.
    """

    def test_an_unchanged_delivery_is_skipped(self, tmp_path, monkeypatch):
        """Nothing is staged, and the run says so in the history."""
        extract, lyrx = delivery_files(tmp_path)
        stored = ingest.digest([extract, lyrx])
        connection = FakeConnection(previous=('loaded', stored, None, 1))
        no_staging(monkeypatch)

        code = ingest.load(make_args(), PIP_CONSULTATION_AREAS,
                           [extract], lyrx, connection, TARGET)

        assert code == ingest.EXIT_OK
        assert connection.statuses == ['skipped']

    def test_a_symbology_only_re_export_is_loaded(self, tmp_path, monkeypatch):
        """The bug itself, at the call site.

        The stored digest is what hashing the extract alone gives. Reaching
        ogr2ogr is the assertion: this has to be loaded, not skipped.
        """
        extract, lyrx = delivery_files(tmp_path)
        extract_only = ingest.digest([extract])
        connection = FakeConnection(previous=('loaded', extract_only, None, 1))
        no_staging(monkeypatch)

        with pytest.raises(StageCalledError):
            ingest.load(make_args(), PIP_CONSULTATION_AREAS,
                        [extract], lyrx, connection, TARGET)

        assert connection.statuses == []

    def test_force_loads_a_delivery_that_has_not_changed(self, tmp_path, monkeypatch):
        """--force is what gets past the skip when somebody needs it to."""
        extract, lyrx = delivery_files(tmp_path)
        stored = ingest.digest([extract, lyrx])
        connection = FakeConnection(previous=('loaded', stored, None, 1))
        no_staging(monkeypatch)

        with pytest.raises(StageCalledError):
            ingest.load(make_args(force=True), PIP_CONSULTATION_AREAS,
                        [extract], lyrx, connection, TARGET)


class TestLoadRefusesABadStyle:
    """An untranslatable .lyrx has to leave the trace every refusal leaves."""

    def test_an_untranslatable_lyrx_is_recorded_as_a_refusal(self, tmp_path, monkeypatch):
        """Exit 1, a 'refused' row, and the reason in it - not a traceback.

        The wiring from load() through refuse(), which was the untested half.
        """
        document = lyrx_document()
        document['layerDefinitions'][0]['renderer']['type'] = 'CIMSimpleRenderer'
        extract, lyrx = delivery_files(tmp_path, document)
        connection = FakeConnection(previous=None)
        no_staging(monkeypatch)

        code = ingest.load(make_args(), PIP_CONSULTATION_AREAS,
                           [extract], lyrx, connection, TARGET)

        assert code == ingest.EXIT_REFUSED
        assert connection.statuses == ['refused']
        assert 'cannot be translated' in connection.notes()['refusals'][0]

    def test_nothing_is_staged_for_a_style_that_will_not_translate(self, tmp_path, monkeypatch):
        """The refusal comes before the 74MB, not after it."""
        document = lyrx_document()
        document['layerDefinitions'][0]['renderer']['fields'] = ['A', 'B']
        extract, lyrx = delivery_files(tmp_path, document)
        connection = FakeConnection(previous=None)
        no_staging(monkeypatch)

        assert ingest.load(make_args(), PIP_CONSULTATION_AREAS, [extract],
                           lyrx, connection, TARGET) == ingest.EXIT_REFUSED


class TestMainOnADatabaseError:
    """What an unexpected database error mid-load is worth.

    The structural checks raise deliberately and come back as refusals.
    Anything else is the ingest breaking, and the codes differ: 1 sends a
    person to the file, 2 sends them to us.
    """

    def run_main(self, monkeypatch, tmp_path, connection):
        """Drive main() against a scripted database, without touching one."""
        extract, lyrx = delivery_files(tmp_path)
        monkeypatch.setattr(sys, 'argv', [
            'ingest_local_layer.py', '--layer', 'pip',
            '--source', str(extract), '--lyrx', str(lyrx),
            '--database-url', 'postgresql://map:map@localhost:5432/map-db',
        ])
        monkeypatch.setattr(ingest, 'connect', lambda target: connection)
        monkeypatch.setattr(ingest, 'stage', lambda *a, **k: 0.0)
        return ingest.main()

    def test_a_transform_error_is_a_failure_with_a_history_row(self, monkeypatch, tmp_path):
        """Exit 2 and a 'failed' row, where this was a bare traceback.

        A name longer than its varchar(100) passes validate.sql, then raises in
        transform.sql. Nothing judged the extract, so it is not a refusal.
        """
        connection = FakeConnection(
            previous=None,
            fail_on='TRUNCATE cache.pip_consultation_areas',
            error=psycopg2.errors.StringDataRightTruncation(  # pylint: disable=no-member
                'value too long for type character varying(100)'),
        )

        code = self.run_main(monkeypatch, tmp_path, connection)

        assert code == ingest.EXIT_FAILED
        assert connection.statuses == ['failed']
        assert 'too long' in connection.notes()['error']

    def test_a_missing_staging_table_is_a_failure_not_a_refusal(self, monkeypatch, tmp_path):
        """The other shape: the checks cannot run at all.

        validate() converts only a deliberate RAISE, so an UndefinedTable from
        the same statement is a system fault.
        """
        connection = FakeConnection(
            previous=None,
            fail_on='the extract staged no rows at all',
            error=psycopg2.errors.UndefinedTable(  # pylint: disable=no-member
                'relation "cache.pip_consultation_areas_src" does not exist'),
        )

        code = self.run_main(monkeypatch, tmp_path, connection)

        assert code == ingest.EXIT_FAILED
        assert connection.statuses == ['failed']

    def test_a_dropped_connection_still_ends_in_a_failure(self, monkeypatch, tmp_path):
        """The case main()'s handler claims, now actually true.

        A dead connection cannot be rolled back, so the cleanup in `finally`
        raises - and that discards the exit code the handler chose, turning a
        correctly identified failure into a traceback and exit 1.
        """
        connection = FakeConnection(
            previous=None,
            fail_on='TRUNCATE cache.pip_consultation_areas',
            error=psycopg2.OperationalError(
                'server closed the connection unexpectedly'),
            dies=True,
        )

        code = self.run_main(monkeypatch, tmp_path, connection)

        assert code == ingest.EXIT_FAILED
        # No history row: the connection that would have carried it is gone.
        # The failed Job is the record, which the module docstring allows for.
        assert connection.statuses == []
        assert connection.closed

    def test_giving_up_on_the_cleanup_is_said_out_loud(
            self, monkeypatch, tmp_path, capsys):
        """Swallowed so it cannot replace the exit code, but not in silence."""
        connection = FakeConnection(
            previous=None,
            fail_on='TRUNCATE cache.pip_consultation_areas',
            error=psycopg2.OperationalError('server closed the connection'),
            dies=True,
        )

        self.run_main(monkeypatch, tmp_path, connection)
        errors = capsys.readouterr().err

        assert 'could not run: server closed the connection' in errors
        assert 'could not record the failure either' in errors
        assert 'could not clear the staging table away' in errors

    def test_the_connection_is_closed_on_a_database_error(self, monkeypatch, tmp_path):
        """Whatever happened, the load does not leave a connection behind."""
        connection = FakeConnection(
            previous=None,
            fail_on='TRUNCATE cache.pip_consultation_areas',
            error=psycopg2.errors.StringDataRightTruncation('too long'),  # pylint: disable=no-member
        )

        self.run_main(monkeypatch, tmp_path, connection)

        assert connection.closed


class TestDescribeDbError:
    """The one line a Job log gets instead of psycopg2's several."""

    def test_a_plain_error_is_its_own_message(self):
        """Nothing to add where there is no diagnostic to read."""
        error = psycopg2.errors.UndefinedTable('relation "x" does not exist')  # pylint: disable=no-member

        assert ingest.describe_db_error(error) == 'relation "x" does not exist'

    def test_a_sqlstate_is_named_where_there_is_one(self):
        """The code is what identifies the fault across wordings and locales."""
        class WithCodeError(Exception):
            """Carry a pgcode, as a real error does."""

            pgcode = '22001'

        assert '(SQLSTATE 22001)' in ingest.describe_db_error(WithCodeError('too long'))


class TestTargetFromUrl:
    """Reading a connection target out of a URL, without leaking it.

    These messages go to stderr and into the load history, which on a deployed
    run is a Job log readable by a wider group than can read the secret.
    """

    def test_a_url_is_read_into_its_parts(self):
        """The ordinary case, percent-decoded as db_uri() encoded it."""
        target = ingest.target_from_url(
            'postgresql://map%40user:pa%40ss@db.example.invalid:5433/map-db')

        assert target.host == 'db.example.invalid'
        assert target.port == 5433
        assert target.user == 'map@user'
        assert target.password == 'pa@ss'
        assert target.dbname == 'map-db'

    def test_a_missing_port_is_the_postgres_default(self):
        """Nothing in the URL means 5432, not an error."""
        assert ingest.target_from_url(
            'postgresql://map:map@localhost/map-db').port == 5432

    # Two halves, so a message can be checked for either: an earlier version
    # looked only for the whole 'ab/cd' and passed a message leaking the 'ab',
    # urllib naming everything before the / as the port.
    SECRET_HEAD = 'PROBEHEAD'
    SECRET_TAIL = 'PROBETAIL'

    @pytest.mark.parametrize('separator', ['/', '#', '?', '@', ':'])
    def test_no_failure_message_carries_any_part_of_the_password(self, separator):
        """Not the whole password, and not the half urllib reads as a port."""
        password = f'{self.SECRET_HEAD}{separator}{self.SECRET_TAIL}'
        url = f'postgresql://probeuser:{password}@localhost:5432/map-db'

        try:
            ingest.target_from_url(url)
        except ingest.CannotRunError as failure:
            message = str(failure)
        else:
            # Some separators parse into a target rather than failing. Nothing
            # was printed, so there is nothing to leak.
            return

        assert password not in message
        assert self.SECRET_HEAD not in message
        assert self.SECRET_TAIL not in message
        assert url not in message

    def test_a_parse_failure_does_not_chain_the_original(self):
        """`from None`, so a traceback cannot print what the message would not."""
        with pytest.raises(ingest.CannotRunError) as failure:
            ingest.target_from_url(
                f'postgresql://u:{self.SECRET_HEAD}/x@localhost:5432/db')

        assert failure.value.__cause__ is None
        assert failure.value.__context__ is None or \
            failure.value.__suppress_context__

    @pytest.mark.parametrize('url', [
        'postgresql://map:ab/cd@localhost:5432/map-db',
        'postgresql://map:ab#cd@localhost:5432/map-db',
        'postgresql://map:map@localhost:not-a-port/map-db',
        'host=localhost port=5432 dbname=map-db user=map password=map',
    ])
    def test_a_url_that_will_not_parse_is_a_failure_not_a_traceback(self, url):
        """Each of these left main() as an uncaught ValueError, so exit 1."""
        with pytest.raises(ingest.CannotRunError):
            ingest.target_from_url(url)
