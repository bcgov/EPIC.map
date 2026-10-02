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
"""Tests for the ogr2ogr command the ingest builds, in both of its modes.

Nothing here runs GDAL. What matters is that the load a developer rehearses
through the pinned container and the load the CronJob performs directly are the
same load - which is a property of two argument lists, and is assertable without
a database, a 74MB extract or either mode being installed.
"""

from pathlib import Path

import pytest

from map_api.services.local_layer_service import ogr
from map_api.services.local_layer_service.ingest_spec import INGEST_SPECS


SPEC = INGEST_SPECS['pip']
SOURCE = Path('/home/someone/deliveries/PIP_CONSULTATION_AREAS.gpkg')
SQL_DIR = Path('/opt/app-root/scripts/sql/pip_consultation_areas')
DSN = "PG:host='db' port='5432' dbname='map-db' user='map' password='map'"


def source_layer(index=0):
    """Return the spec's own source layer, so the tests move with it."""
    return SPEC.sources[index]


def local(index=0):
    """Build the direct call."""
    return ogr.local_command(SPEC, SOURCE, source_layer(), index, SQL_DIR, DSN)


def docker(index=0):
    """Build the containerised call."""
    return ogr.docker_command(SPEC, SOURCE, source_layer(), index, SQL_DIR, DSN)


def flag_value(argv, flag):
    """Return the argument following a flag."""
    return argv[argv.index(flag) + 1]


class TestResolveMode:
    """Which ogr2ogr to reach for."""

    def test_auto_picks_local_when_ogr2ogr_is_on_path(self):
        """Which is the case inside the ingest image."""
        assert ogr.resolve_mode('auto', which=lambda name: '/usr/bin/ogr2ogr') == 'local'

    def test_auto_picks_docker_when_it_is_not(self):
        """Which is the case on a laptop, where GDAL is not a dependency."""
        assert ogr.resolve_mode('auto', which=lambda name: None) == 'docker'

    def test_auto_asks_about_ogr2ogr_specifically(self):
        """Not about docker, and not about gdalinfo."""
        asked = []
        ogr.resolve_mode('auto', which=asked.append)
        assert asked == ['ogr2ogr']

    @pytest.mark.parametrize('requested', ['local', 'docker'])
    def test_an_explicit_choice_ignores_what_is_installed(self, requested):
        """The ingest image sets local so a broken PATH fails loudly.

        Falling back to docker inside a pod would produce 'docker: not found',
        which reads like a missing dependency rather than a missing GDAL.
        """
        assert ogr.resolve_mode(requested, which=lambda name: '/usr/bin/ogr2ogr') == requested
        assert ogr.resolve_mode(requested, which=lambda name: None) == requested

    def test_an_unknown_mode_is_refused(self):
        """Reject a mode argparse would not have allowed through."""
        with pytest.raises(ValueError):
            ogr.resolve_mode('vsis3')


class TestCommandFor:
    """The builder a resolved mode selects."""

    def test_local_mode_builds_the_direct_call(self):
        """No docker anywhere in it."""
        assert ogr.command_for('local') is ogr.local_command

    def test_docker_mode_builds_the_containerised_call(self):
        """The pinned image."""
        assert ogr.command_for('docker') is ogr.docker_command


class TestSharedArguments:
    """What is true of the call however it is reached."""

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_writes_the_staging_table_not_the_target(self, argv):
        """Nothing ogr2ogr writes is visible to the map until the transform commits."""
        assert flag_value(argv, '-nln') == SPEC.staging_table
        assert SPEC.target_table not in argv

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_transforms_to_the_serving_srs(self, argv):
        """3857, so tiles are not reprojecting millions of vertices per request."""
        assert flag_value(argv, '-t_srs') == ogr.TARGET_SRID == 'EPSG:3857'

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_promotes_to_the_geometry_type_the_spec_names(self, argv):
        """The target column is typed, so a mismatch fails at INSERT rather than here."""
        assert flag_value(argv, '-nlt') == source_layer().geometry_type

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_uses_the_sqlite_dialect(self, argv):
        """The select is written for it - OGR SQL would not parse it."""
        assert flag_value(argv, '-dialect') == 'SQLITE'

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_names_the_geometry_column_and_skips_the_index(self, argv):
        """Geom because the SQL says geom; no index on a table dropped seconds later."""
        assert 'GEOMETRY_NAME=geom' in argv
        assert 'SPATIAL_INDEX=NONE' in argv

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_it_copies_rather_than_inserting_row_by_row(self, argv):
        """COPY is the difference between seconds and minutes on 400k vertices."""
        assert argv[argv.index('--config') + 1:argv.index('--config') + 3] == \
            ['PG_USE_COPY', 'YES']

    @pytest.mark.parametrize('argv', [local(), docker()])
    def test_the_dsn_is_passed_as_given(self, argv):
        """Quoting and escaping it is the caller's job, done once in the script."""
        assert flag_value(argv, '-f') == 'PostgreSQL'
        assert DSN in argv


class TestAppendOrder:
    """How several files become one staging table."""

    @pytest.mark.parametrize('build', [ogr.local_command, ogr.docker_command])
    def test_the_first_source_overwrites(self, build):
        """So a rerun does not append to yesterday's staging rows."""
        argv = build(SPEC, SOURCE, source_layer(), 0, SQL_DIR, DSN)
        assert '-overwrite' in argv
        assert '-append' not in argv

    @pytest.mark.parametrize('build', [ogr.local_command, ogr.docker_command])
    def test_every_later_source_appends(self, build):
        """Which is how three shapefiles land where one three-layer gpkg would."""
        argv = build(SPEC, SOURCE, source_layer(), 1, SQL_DIR, DSN)
        assert '-append' in argv
        assert '-overwrite' not in argv


class TestPaths:
    """The only thing the two modes disagree about."""

    def test_local_names_the_paths_as_they_are(self):
        """No mounts, so the real paths are the right ones."""
        argv = local()
        assert str(SOURCE) in argv
        assert flag_value(argv, '-sql') == f'@{SQL_DIR / source_layer().select}'

    def test_docker_names_the_paths_inside_the_container(self):
        """Which is what the -v arguments above put there."""
        argv = docker()
        assert f'{ogr.DATA_MOUNT}/{SOURCE.name}' in argv
        assert flag_value(argv, '-sql') == f'@{ogr.SQL_MOUNT}/{source_layer().select}'

    def test_docker_mounts_the_extract_and_the_sql_read_only(self):
        """The load reads them; nothing it does should be able to write them."""
        argv = docker()
        assert f'{SOURCE.parent}:{ogr.DATA_MOUNT}:ro' in argv
        assert f'{SQL_DIR}:{ogr.SQL_MOUNT}:ro' in argv

    def test_docker_runs_the_pinned_image_on_the_host_network(self):
        """Pinned, because a load that cannot be repeated is not evidence."""
        argv = docker()
        assert argv[:5] == ['docker', 'run', '--rm', '--network', 'host']
        assert ogr.GDAL_IMAGE in argv

    def test_docker_reaches_ogr2ogr_after_the_image_name(self):
        """Everything before it is docker's; everything after it is GDAL's."""
        argv = docker()
        assert argv[argv.index(ogr.GDAL_IMAGE) + 1] == 'ogr2ogr'


def test_the_two_modes_differ_only_in_the_two_paths():
    """The property the whole module exists for.

    Strip docker's prefix and swap the two paths, and the calls are identical. If
    this ever fails, a developer is rehearsing a load the CronJob does not
    perform - which is the one way this design can quietly go wrong.
    """
    direct = local()
    containerised = docker()
    # Everything from the ogr2ogr binary onwards.
    containerised = containerised[containerised.index(ogr.GDAL_IMAGE) + 1:]

    assert len(direct) == len(containerised)
    differences = [
        (one, other) for one, other in zip(direct, containerised) if one != other
    ]
    assert differences == [
        (str(SOURCE), f'{ogr.DATA_MOUNT}/{SOURCE.name}'),
        (f'@{SQL_DIR / source_layer().select}', f'@{ogr.SQL_MOUNT}/{source_layer().select}'),
    ]
