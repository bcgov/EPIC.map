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
"""The EAO transform agrees with the module that generates its category column.

transform.sql carries the category CASE literally, so the file can be read and
run by hand. That is two copies of one rule, and this is what stops them
drifting: change eao_categories.py, then paste its output into the file.
"""

import re
from pathlib import Path

import pytest

from map_api.services.local_layer_service.eao_categories import CATEGORIES, amendment_sql, category_case_sql
from map_api.services.local_layer_service.ingest_spec import INGEST_SPECS


API_ROOT = Path(__file__).resolve().parents[3]
SQL_DIR = API_ROOT / 'scripts' / 'sql' / 'eao_project_data'

SPEC = INGEST_SPECS['eao']


def _sql(name: str) -> str:
    return (SQL_DIR / name).read_text(encoding='utf-8')


def _collapsed(text: str) -> str:
    """One line, single-spaced, so indentation is not what is asserted."""
    return re.sub(r'\s+', ' ', text).strip()


def test_the_transform_keys_on_the_delivered_global_id():
    """Key on EAO's own id: every class has carried one since 16/10/2026."""
    assert 'btrim(s.global_id) AS feature_id' in _sql('transform.sql')


def test_the_transform_carries_the_generated_category_case_for_polygons():
    """Polygons are the only class the footprint flag applies to."""
    assert _collapsed(category_case_sql()) in _collapsed(_sql('transform.sql'))


def test_the_transform_carries_the_generated_amendment_flag():
    """Amendment is carried as a field as well as feeding the category."""
    assert _collapsed(amendment_sql('s.subcategory')) in _collapsed(
        _sql('transform.sql'))


def test_the_transform_carries_the_generated_category_case_for_the_rest():
    """Lines and points take the component colours only, as in the prototype."""
    assert _collapsed(category_case_sql(footprint=None)) in _collapsed(
        _sql('transform.sql'))


def test_the_transform_folds_nothing():
    """One delivered row is one feature; the GlobalID distinguishes all 953."""
    assert 'DISTINCT ON' not in _sql('transform.sql')
    assert INGEST_SPECS['eao'].identity.fold_duplicates is False


def test_the_transform_replaces_rather_than_appends():
    """A load that added to the stored rows would double the layer."""
    assert 'DELETE FROM cache.eao_project_data' in _sql('transform.sql')


def test_the_transform_does_not_lock_readers_out():
    """TRUNCATE holds ACCESS EXCLUSIVE until commit, and this layer is always drawn.

    The PIP transform says the same thing; a load that queued every tile
    request behind it would stall every open map. Statements only - the comment
    above the DELETE names TRUNCATE to say why it is not used.
    """
    statements = '\n'.join(
        line for line in _sql('transform.sql').splitlines()
        if not line.lstrip().startswith('--')
    )
    assert 'TRUNCATE' not in statements


@pytest.mark.parametrize('source', SPEC.sources, ids=lambda s: s.name)
def test_every_class_stages_the_global_id(source):
    """It is the primary key, so a class that omitted it would fail the insert."""
    assert 'GlobalID     AS global_id' in _sql(source.select)


def test_validate_guards_the_key():
    """A blank or repeated id fails the insert after the truncate has run."""
    validate = _sql('validate.sql')
    assert 'have no GlobalID' in validate
    assert 'more than one staged row' in validate


@pytest.mark.parametrize('source', SPEC.sources, ids=lambda s: s.name)
def test_every_select_reads_the_class_the_spec_names(source):
    """The FROM is what actually chooses the layer; the spec only names it."""
    assert f'FROM {source.name}' in _sql(source.select)


@pytest.mark.parametrize('source', SPEC.sources, ids=lambda s: s.name)
def test_every_select_carries_the_geometry(source):
    """The SQLITE dialect drops it silently where it is not selected."""
    assert 'Shape' in _sql(source.select)


@pytest.mark.parametrize('source', SPEC.sources, ids=lambda s: s.name)
def test_every_select_stages_one_shape(source):
    """Three classes append into one table, so they must agree column for column."""
    aliases = set(re.findall(r'AS\s+([a-z_]+)', _sql(source.select)))
    expected = set(re.findall(
        r'AS\s+([a-z_]+)', _sql(SPEC.sources[0].select)))
    assert aliases == expected


@pytest.mark.parametrize('source', SPEC.sources, ids=lambda s: s.name)
def test_every_class_is_staged_as_two_dimensions(source):
    """The delivery is ZM; carrying the Z would double the stored geometry."""
    assert source.dimension == 'XY'


def test_the_point_class_stages_no_footprint_flag():
    """It has no such column, which is why the category rule drops that branch."""
    point = _sql('source_select_point.sql')
    assert 'NULL         AS footprint' in point


def test_validate_checks_every_class_arrived():
    """The selects append, so a class that failed to stage is a smaller layer."""
    validate = _sql('validate.sql')
    for expected in ("('poly')", "('line')", "('point')"):
        assert expected in validate


def test_validate_checks_the_track_join():
    """A footprint with no project is a shape nothing can open."""
    assert 'non-numeric TrackID' in _sql('validate.sql')


def test_validate_checks_the_geometry_is_flat():
    """Without -dim XY the Z and M would be stored."""
    assert 'ST_NDims(geom) <> 2' in _sql('validate.sql')


@pytest.mark.parametrize('category', CATEGORIES, ids=lambda c: c.slug)
def test_every_category_the_style_matches_can_be_written(category):
    """A category the transform never writes would be a dead branch in the style."""
    assert f"'{category.slug}'" in _sql('transform.sql')
