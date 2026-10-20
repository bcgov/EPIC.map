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
"""How the ingest calls ogr2ogr, in the two places it runs.

A laptop has no GDAL, so it runs the pinned container; a pod cannot start a
container, so it runs the ogr2ogr in its own image, built FROM that same tag
with a test asserting they do not drift.

Only the paths differ. Everything after the binary is built once, by
ogr2ogr_argv, so the rehearsed load is the one the CronJob performs - and both
are assertable without GDAL, a database or a 74MB extract.
"""

import shutil
from pathlib import Path
from typing import Callable, List

# The same six arguments throughout: a parameter object would move the list
# rather than shorten it, and put a layer between the test and the argv.
# pylint: disable=too-many-arguments


# Pinned: a load that cannot be repeated is not evidence. The ingest image is
# built FROM this tag, and a test reads its FROM line back.
GDAL_IMAGE = 'ghcr.io/osgeo/gdal:ubuntu-small-3.9.2'

# 3857 because ST_AsMVTGeom needs both its arguments in one SRS, and doing it
# here beats transforming millions of vertices per tile request.
TARGET_SRID = 'EPSG:3857'

# Where the container sees the extract and the SQL, under docker.
DATA_MOUNT = '/data'
SQL_MOUNT = '/sql'

MODES = ('auto', 'local', 'docker')


def resolve_mode(requested: str, which: Callable[[str], object] = shutil.which) -> str:
    """Decide whether to run ogr2ogr directly or in the pinned container.

    'auto' asks whether it is on PATH: true in the ingest image, false on a
    laptop. The image sets INGEST_GDAL=local so a broken PATH fails loudly
    rather than trying a `docker run` no pod can perform.

    `which` is a parameter so this is assertable without touching PATH.
    """
    if requested not in MODES:
        raise ValueError(f'unknown GDAL mode {requested!r}; expected one of {", ".join(MODES)}')
    if requested != 'auto':
        return requested
    return 'local' if which('ogr2ogr') else 'docker'


def ogr2ogr_argv(spec, source_layer, index: int, source_arg: str, sql_arg: str,
                 dsn: str) -> List[str]:
    """Build the ogr2ogr call itself: everything the same in both modes.

    The first source overwrites and the rest append, so three shapefiles and a
    three-layer GeoPackage land the same.
    """
    return [
        'ogr2ogr',
        '-f', 'PostgreSQL', dsn,
        source_arg,
        # The only part that changes if the source format does.
        '-sql', sql_arg,
        '-dialect', 'SQLITE',
        '-nln', spec.staging_table,
        '-overwrite' if index == 0 else '-append',
        '-t_srs', TARGET_SRID,
        '-nlt', source_layer.geometry_type,
        *(['-dim', source_layer.dimension] if source_layer.dimension else []),
        '-lco', 'GEOMETRY_NAME=geom',
        # No index on a table that is dropped a few seconds from now.
        '-lco', 'SPATIAL_INDEX=NONE',
        '--config', 'PG_USE_COPY', 'YES',
    ]


def local_command(spec, source: Path, source_layer, index: int, sql_dir: Path,
                  dsn: str) -> List[str]:
    """Run the ogr2ogr that is already here, against the paths as they are."""
    return ogr2ogr_argv(
        spec, source_layer, index,
        source_arg=str(source),
        sql_arg=f'@{sql_dir / source_layer.select}',
        dsn=dsn,
    )


def docker_command(spec, source: Path, source_layer, index: int, sql_dir: Path,
                   dsn: str) -> List[str]:
    """Run the pinned image, with the extract and the SQL bind-mounted in.

    --network host because the database is on the host: the compose Postgres,
    or a deployed one through a tunnel.
    """
    return [
        'docker', 'run', '--rm', '--network', 'host',
        '-v', f'{source.parent}:{DATA_MOUNT}:ro',
        '-v', f'{sql_dir}:{SQL_MOUNT}:ro',
        GDAL_IMAGE,
    ] + ogr2ogr_argv(
        spec, source_layer, index,
        source_arg=f'{DATA_MOUNT}/{source.name}',
        sql_arg=f'@{SQL_MOUNT}/{source_layer.select}',
        dsn=dsn,
    )


def command_for(mode: str):
    """Return the command builder for a resolved mode."""
    return local_command if mode == 'local' else docker_command
