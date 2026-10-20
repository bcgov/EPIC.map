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
"""The feature-history diff, run against Postgres rather than asserted as text.

test_ingest_script.py checks the statement write_feature_history builds, which
proves the SQL says what it should and nothing about what it does: dropping
`OR d.geom_changed` from the changed CTE left all of those tests green while
geometry-only edits stopped being recorded. These run the real statement over
temp tables and read the rows back.
"""

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

from map_api.models.db import db
from map_api.services.local_layer_service import LOCAL_LAYERS

API_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = API_ROOT / 'scripts' / 'ingest_local_layer.py'

# A point, and the same point moved, in the SRS the layer stores.
HERE = 'ST_SetSRID(ST_MakePoint(1, 1), 3857)'
THERE = 'ST_SetSRID(ST_MakePoint(2, 2), 3857)'

LAYER = 'TEST.HISTORY_LAYER'


def load_script():
    """Import the ingest script from its path, as test_ingest_script.py does."""
    spec = importlib.util.spec_from_file_location('ingest_local_layer', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ingest = load_script()


@pytest.fixture()
def history(app, session):  # pylint: disable=unused-argument
    """Temp tables shaped like a hosted layer's, and the diff pointed at them.

    Registered under a name of its own so the real layers are untouched. The
    cursor is the session's own DBAPI cursor, because the statement is written
    for psycopg2 - and because that keeps the temp tables and the writes inside
    the transaction the session fixture rolls back.
    """
    local_layer = type(LOCAL_LAYERS['WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP'])
    LOCAL_LAYERS[LAYER] = local_layer(
        table='history_current',
        mvt_layer='t',
        properties=('feature_id',),
        key='feature_id',
        detail_columns=('feature_id', 'label', 'category'),
        serves_feature_detail=False,
    )
    previous, target = ingest.PREVIOUS_TABLE, ingest.HISTORY_TABLE
    ingest.PREVIOUS_TABLE = 'history_previous'
    ingest.HISTORY_TABLE = 'history_rows'

    cursor = db.session.connection().connection.cursor()
    cursor.execute("""
        CREATE TEMP TABLE history_current (
            feature_id varchar(38) PRIMARY KEY, label text, category text,
            geom geometry(Geometry, 3857));
        CREATE TEMP TABLE history_previous (
            feature_id varchar(38) PRIMARY KEY, label text, category text,
            geom geometry(Geometry, 3857));
        CREATE TEMP TABLE history_rows (
            id bigserial PRIMARY KEY, object_name varchar(200) NOT NULL,
            feature_id varchar(200) NOT NULL, change varchar(10) NOT NULL,
            occurred_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
            source_name varchar(400) NOT NULL, source_digest varchar(64),
            changed_columns text[], previous jsonb,
            previous_geom geometry(Geometry, 3857));
    """)

    yield SimpleNamespace(
        cursor=cursor,
        spec=SimpleNamespace(object_name=LAYER, target_table='history_current'),
    )

    cursor.close()
    ingest.PREVIOUS_TABLE, ingest.HISTORY_TABLE = previous, target
    LOCAL_LAYERS.pop(LAYER, None)


@pytest.fixture()
def comparison(app, session):  # pylint: disable=unused-argument
    """Make a staging table and a served table for compare() to set against.

    Named so that spec.staging_table and spec.target_table point at temp
    tables, and registered under a name of its own so the real layers are
    untouched.
    """
    local_layer = type(LOCAL_LAYERS['WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP'])
    LOCAL_LAYERS[LAYER] = local_layer(
        table='compare_current',
        mvt_layer='t',
        properties=('feature_id',),
        key='feature_id',
        detail_columns=('feature_id', 'label'),
        serves_feature_detail=False,
    )

    cursor = db.session.connection().connection.cursor()
    cursor.execute("""
        CREATE TEMP TABLE compare_current (
            feature_id varchar(38) PRIMARY KEY, label text,
            geom geometry(Geometry, 3857));
        CREATE TEMP TABLE compare_staged (
            global_id varchar(38) PRIMARY KEY, label text,
            geom geometry(Geometry, 3857));
    """)

    identity = SimpleNamespace(key='global_id', label='label',
                               fold_duplicates=False)
    yield SimpleNamespace(
        cursor=cursor,
        spec=SimpleNamespace(
            object_name=LAYER,
            staging_table='compare_staged',
            target_table='compare_current',
            identity=identity,
        ),
    )

    cursor.close()
    LOCAL_LAYERS.pop(LAYER, None)


def _stage(cursor, rows):
    """Insert (id, label, geometry) rows into the staging table."""
    for feature_id, label, geom in rows:
        cursor.execute(
            'INSERT INTO compare_staged (global_id, label, geom) '
            f'VALUES (%s, %s, {geom})', (feature_id, label))


def _store(cursor, rows):
    """Put the same rows into the served table, under its own key name."""
    for feature_id, label, geom in rows:
        cursor.execute(
            'INSERT INTO compare_current (feature_id, label, geom) '
            f'VALUES (%s, %s, {geom})', (feature_id, label))


def _load(cursor, table, rows):
    """Put the given (id, label, category, geometry) rows into a table."""
    for feature_id, label, category, geom in rows:
        cursor.execute(
            f'INSERT INTO {table} (feature_id, label, category, geom) '
            f'VALUES (%s, %s, %s, {geom})', (feature_id, label, category))


def _rows(cursor):
    """Read back the history written, by feature."""
    cursor.execute("""
        SELECT feature_id, change, changed_columns, previous ->> 'category',
               previous_geom IS NOT NULL
        FROM history_rows ORDER BY feature_id
    """)
    return {row[0]: row[1:] for row in cursor.fetchall()}


def test_an_attribute_only_fix_is_recorded_with_the_column(history):
    """The case that matters most: a data fix, no geometry touched."""
    _load(history.cursor, 'history_previous', [('A', 'Pad', 'EAC Assessement', HERE)])
    _load(history.cursor, 'history_current', [('A', 'Pad', 'EAC Assessment', HERE)])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 0, 'changed': 1, 'removed': 0}
    change, columns, was, geom = _rows(history.cursor)['A']
    assert change == 'changed'
    assert columns == ['category']
    assert was == 'EAC Assessement'
    # No geometry copy for a fix that did not move anything.
    assert geom is False


def test_a_geometry_only_move_is_recorded(history):
    """The mutation that survived the text-only tests: `OR d.geom_changed`."""
    _load(history.cursor, 'history_previous', [('B', 'Road', 'Pre EA', HERE)])
    _load(history.cursor, 'history_current', [('B', 'Road', 'Pre EA', THERE)])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 0, 'changed': 1, 'removed': 0}
    change, columns, _, geom = _rows(history.cursor)['B']
    assert change == 'changed'
    assert columns == ['geom']
    # The shape it had, which the current table no longer holds.
    assert geom is True


def test_an_untouched_feature_is_not_recorded(history):
    """Most features in most deliveries, so a row each would drown the rest."""
    _load(history.cursor, 'history_previous', [('C', 'Pit', 'Pre EA', HERE)])
    _load(history.cursor, 'history_current', [('C', 'Pit', 'Pre EA', HERE)])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 0, 'changed': 0, 'removed': 0}
    assert _rows(history.cursor) == {}


def test_an_added_feature_carries_no_previous(history):
    """There is nothing it replaced, so naming every value would say nothing."""
    _load(history.cursor, 'history_current', [('D', 'New', 'Pre EA', HERE)])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 1, 'changed': 0, 'removed': 0}
    change, columns, was, geom = _rows(history.cursor)['D']
    assert (change, columns, was, geom) == ('added', None, None, False)


def test_a_removed_feature_keeps_its_shape_and_attributes(history):
    """What happened to a footprint that is gone is only answerable from here."""
    _load(history.cursor, 'history_previous', [('E', 'Gone', 'Post Decision', HERE)])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 0, 'changed': 0, 'removed': 1}
    change, _, was, geom = _rows(history.cursor)['E']
    assert (change, was, geom) == ('removed', 'Post Decision', True)


def test_a_delivery_that_adds_changes_and_removes_at_once(history):
    """The counts the operator reads, over one mixed delivery."""
    _load(history.cursor, 'history_previous', [
        ('A', 'Pad', 'EAC Assessement', HERE),
        ('B', 'Road', 'Pre EA', HERE),
        ('C', 'Pit', 'Pre EA', HERE),
        ('E', 'Gone', 'Post Decision', HERE),
    ])
    _load(history.cursor, 'history_current', [
        ('A', 'Pad', 'EAC Assessment', HERE),
        ('B', 'Road', 'Pre EA', THERE),
        ('C', 'Pit', 'Pre EA', HERE),
        ('D', 'New', 'Pre EA', HERE),
    ])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'delivery.gpkg', 'abc')

    assert counts == {'added': 1, 'changed': 2, 'removed': 1}
    written = _rows(history.cursor)
    assert sorted(written) == ['A', 'B', 'D', 'E']
    assert written['A'][1] == ['category']
    assert written['B'][1] == ['geom']


def test_a_cache_rebuild_is_not_recorded_as_every_feature_arriving(history):
    """The reason the history lives in `app` is undone if a rebuild rewrites it.

    Dropping the cache schema and reloading the same delivery leaves the
    previous table empty, so every current row looks new. Recording that would
    date every feature's arrival to the day the cache was dropped, and the
    index exists to answer the opposite question.
    """
    # A delivery already recorded: this feature arrived once, earlier.
    _load(history.cursor, 'history_current', [('A', 'Pad', 'Pre EA', HERE)])
    history.cursor.execute(
        'INSERT INTO history_rows (object_name, feature_id, change, source_name)'
        " VALUES (%s, 'A', 'added', 'first.gpkg')", (LAYER,))

    # The rebuild: the table was emptied and refilled from the same delivery,
    # so capture_previous copied nothing.
    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'first.gpkg', 'abc')

    assert counts == {'added': 0, 'changed': 0, 'removed': 0}
    # The original arrival is still the only thing recorded against it.
    history.cursor.execute(
        'SELECT change, source_name FROM history_rows WHERE feature_id = %s', ('A',))
    assert history.cursor.fetchall() == [('added', 'first.gpkg')]


def test_a_genuine_first_load_is_still_recorded(history):
    """Nothing recorded yet, so the baseline every later load measures against."""
    _load(history.cursor, 'history_current', [
        ('A', 'Pad', 'Pre EA', HERE),
        ('B', 'Road', 'Pre EA', HERE),
    ])

    counts = ingest.write_feature_history(
        history.cursor, history.spec, 'first.gpkg', 'abc')

    assert counts == {'added': 2, 'changed': 0, 'removed': 0}


# compare() sets the staged extract against the stored one before the transform
# runs, and what it reports is what the operator reads - the only figure a dry
# run shows. It matches on the key because names repeat: EAO carries the same
# 'project - label' on many features, and joining on the name counted every
# pair that shared one as a changed shape.

def test_an_unchanged_delivery_reports_no_change(comparison):
    """Twenty phantom changes on an identical delivery was the bug."""
    rows = [
        ('A', 'Mine - Historical Trail', HERE),
        ('B', 'Mine - Historical Trail', THERE),
        ('C', 'Mine - Historical Trail', HERE),
    ]
    _stage(comparison.cursor, rows)
    _store(comparison.cursor, rows)

    result = ingest.compare(comparison.cursor, comparison.spec)

    assert (result.added, result.removed, result.changed) == ([], [], [])


def test_a_moved_feature_is_the_one_reported(comparison):
    """Only the feature whose shape changed, not everything sharing its name."""
    _store(comparison.cursor, [
        ('A', 'Mine - Historical Trail', HERE),
        ('B', 'Mine - Historical Trail', HERE),
    ])
    _stage(comparison.cursor, [
        ('A', 'Mine - Historical Trail', HERE),
        ('B', 'Mine - Historical Trail', THERE),
    ])

    result = ingest.compare(comparison.cursor, comparison.spec)

    assert result.added == []
    assert result.removed == []
    assert result.changed == ['Mine - Historical Trail']


def test_an_added_and_a_removed_feature_are_named(comparison):
    """Matched on the key, so a new id is an add even where the name repeats."""
    _store(comparison.cursor, [('A', 'Mine - Pad', HERE), ('B', 'Mine - Gone', HERE)])
    _stage(comparison.cursor, [('A', 'Mine - Pad', HERE), ('C', 'Mine - Pad', HERE)])

    result = ingest.compare(comparison.cursor, comparison.spec)

    assert result.added == ['Mine - Pad']
    assert result.removed == ['Mine - Gone']
    assert result.changed == []
