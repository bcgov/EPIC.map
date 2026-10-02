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
"""The ingest descriptors agree with what serves them, and with the files on disk.

These are the checks that replace a single merged registry. The ingest spec and
LOCAL_LAYERS are two structures describing one layer, and every way they can
drift is a failure nobody would see at the time: a missing SQL file surfaces
part way through a load, a shared lock key surfaces as a scheduled run that
does nothing, and an object_name nothing serves surfaces as a table no tile
ever reads.
"""

from pathlib import Path

import pytest

from map_api.services.local_layer_service import LOCAL_LAYERS, ogr
from map_api.services.local_layer_service.ingest_spec import INGEST_SPECS


API_ROOT = Path(__file__).resolve().parents[3]
SQL_ROOT = API_ROOT / 'scripts' / 'sql'
STYLE_ROOT = (
    API_ROOT / 'src' / 'map_api' / 'services' / 'local_layer_service' / 'styles'
)
INGEST_DOCKERFILE = API_ROOT / 'Dockerfile.ingest'


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_spec_names_a_served_layer(name):
    """An ingest that nothing serves loads into a table no tile reads."""
    spec = INGEST_SPECS[name]
    assert spec.object_name in LOCAL_LAYERS


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_target_table_comes_from_the_serving_registry(name):
    """The transform must write the table the tile SQL reads."""
    spec = INGEST_SPECS[name]
    assert spec.target_table == LOCAL_LAYERS[spec.object_name].table


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_staging_table_is_not_the_target(name):
    """Staging into the served table would show a half-loaded extract."""
    spec = INGEST_SPECS[name]
    assert spec.staging_table != spec.target_table


def test_lock_keys_are_distinct():
    """A shared key makes one layer's ingest a silent no-op during another's."""
    keys = [spec.lock_key for spec in INGEST_SPECS.values()]
    assert len(keys) == len(set(keys))


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_the_layers_sql_files_exist(name):
    """Fixed filenames, so a spec carries a directory rather than three paths."""
    spec = INGEST_SPECS[name]
    directory = SQL_ROOT / spec.sql_dir
    assert (directory / 'validate.sql').is_file()
    assert (directory / 'transform.sql').is_file()
    for source in spec.sources:
        assert (directory / source.select).is_file()


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_every_source_layer_is_named_in_its_select(name):
    """The FROM clause is what actually chooses the layer; the spec must agree.

    ogr2ogr is handed the select, not the layer name, so a spec naming one
    layer beside a select reading another would stage the wrong features and
    report the right ones.
    """
    spec = INGEST_SPECS[name]
    for source in spec.sources:
        select = (SQL_ROOT / spec.sql_dir / source.select).read_text(encoding='utf-8')
        assert source.name in select


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_style_source_is_one_this_understands(name):
    """A spec styled from a file needs that file; one from a .lyrx needs none."""
    spec = INGEST_SPECS[name]
    assert spec.style.kind in ('lyrx', 'spec')
    if spec.style.kind == 'spec':
        assert spec.style.path
        assert (STYLE_ROOT / spec.style.path).is_file()
        # No classes to match, so the coverage guard must be switched off or it
        # would find nothing and refuse every load.
        assert spec.style.coverage_column is None
    else:
        assert spec.style.coverage_column


# Where the scheduled ingest fetches from. These four are enforced at import by
# ingest_spec._check_s3, so a bad spec cannot be loaded at all - but they are
# asserted here as well, because the thing they protect against is a change made
# months from now to a layer nobody is thinking about, and a failing test says
# which invariant was broken where an ImportError does not.

@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_s3_names_one_key_per_source_layer(name):
    """stage() zips the keys against the source layers.

    Fewer keys than layers stages a subset and reports it as a whole extract,
    which is the one failure this pipeline is not otherwise built to catch: the
    rows that arrive are all valid.
    """
    spec = INGEST_SPECS[name]
    if spec.s3 is None:
        pytest.skip(f'{name} is loaded from files only')
    assert len(spec.s3.sources) == len(spec.sources)


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_s3_names_a_lyrx_exactly_when_one_is_read(name):
    """A .lyrx-styled layer needs the key; a spec-styled one must not carry it.

    Missing, the download succeeds and build_style raises afterwards - having
    spent the transfer. Present but unread, the ingest fetches a file nothing
    opens and nobody notices it is stale.
    """
    spec = INGEST_SPECS[name]
    if spec.s3 is None:
        pytest.skip(f'{name} is loaded from files only')
    assert bool(spec.s3.lyrx) == (spec.style.kind == 'lyrx')


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_s3_keys_are_relative_to_the_bucket(name):
    """A leading slash asks for an object literally named '/gis_db/...'.

    Which comes back as a 404 that reads like a permissions problem.
    """
    spec = INGEST_SPECS[name]
    if spec.s3 is None:
        pytest.skip(f'{name} is loaded from files only')
    for key in list(spec.s3.sources) + ([spec.s3.lyrx] if spec.s3.lyrx else []):
        assert key.strip()
        assert not key.startswith('/')


@pytest.mark.parametrize('name', sorted(INGEST_SPECS))
def test_s3_keys_land_under_distinct_filenames(name):
    """They are downloaded into one directory, so a shared basename loses a file."""
    spec = INGEST_SPECS[name]
    if spec.s3 is None:
        pytest.skip(f'{name} is loaded from files only')
    keys = list(spec.s3.sources) + ([spec.s3.lyrx] if spec.s3.lyrx else [])
    basenames = [key.rsplit('/', 1)[-1] for key in keys]
    assert len(set(basenames)) == len(basenames)


def test_the_ingest_image_is_built_on_the_pinned_gdal():
    """The two ways of reaching ogr2ogr must be the same GDAL.

    A developer rehearses a load through GDAL_IMAGE; the CronJob performs it with
    the ogr2ogr inside Dockerfile.ingest. Nothing else connects those two, and if
    they drift the rehearsal stops being evidence about the real load - silently,
    because both would still succeed.
    """
    assert INGEST_DOCKERFILE.is_file()
    froms = [
        line.split(None, 1)[1].strip()
        for line in INGEST_DOCKERFILE.read_text(encoding='utf-8').splitlines()
        if line.strip().upper().startswith('FROM ')
    ]
    assert froms == [ogr.GDAL_IMAGE]
