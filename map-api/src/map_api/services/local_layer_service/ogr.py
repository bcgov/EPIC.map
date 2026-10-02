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

A developer's laptop does not have GDAL installed and should not have to, so the
ingest has always run it from a pinned container. A scheduled pod cannot start a
container, so it runs the ogr2ogr that is already in its image - which is built
on that same pinned tag, and a test asserts the two do not drift.

The point of this module is that only the paths differ. Everything after the
ogr2ogr binary is built once, by ogr2ogr_argv, so the load a developer rehearses
and the load the CronJob performs are the same load. Building the two commands
here rather than in the script is also what makes them assertable without GDAL,
a database or a 74MB extract.
"""

import shutil
from pathlib import Path
from typing import Callable, List

# The three builders below each take the same six: which layer, which source
# layer, where it is, where the SQL is, which position in the sequence, and where
# the database is. Every one of them is the ogr2ogr call. Bundling them into a
# parameter object would move the list rather than shorten it, and would put a
# layer between the test and the argv it is asserting.
# pylint: disable=too-many-arguments


# Pinned: a load that cannot be repeated is not evidence of anything. The ingest
# image is built FROM this tag - see map-api/Dockerfile.ingest, and the test that
# reads its FROM line back.
GDAL_IMAGE = 'ghcr.io/osgeo/gdal:ubuntu-small-3.9.2'

# 3857 because ST_TileEnvelope speaks it and ST_AsMVTGeom needs both arguments
# in one SRS. Transforming here beats transforming millions of vertices on every
# tile request.
TARGET_SRID = 'EPSG:3857'

# Where the container sees the extract and the SQL, under docker.
DATA_MOUNT = '/data'
SQL_MOUNT = '/sql'

MODES = ('auto', 'local', 'docker')


def resolve_mode(requested: str, which: Callable[[str], object] = shutil.which) -> str:
    """Decide whether to run ogr2ogr directly or in the pinned container.

    'auto' asks whether ogr2ogr is on PATH, which is true in the ingest image and
    false on a laptop. An explicit choice is honoured either way: the ingest
    image sets INGEST_GDAL=local so that a broken PATH fails loudly, rather than
    quietly falling back to a `docker run` no pod can perform.

    `which` is a parameter so this can be asserted without touching PATH.
    """
    if requested not in MODES:
        raise ValueError(f'unknown GDAL mode {requested!r}; expected one of {", ".join(MODES)}')
    if requested != 'auto':
        return requested
    return 'local' if which('ogr2ogr') else 'docker'


def ogr2ogr_argv(spec, source_layer, index: int, source_arg: str, sql_arg: str,
                 dsn: str) -> List[str]:
    """Build the ogr2ogr call itself: everything the same in both modes.

    The first source overwrites and the rest append, so a layer delivered as
    three shapefiles lands in the same staging table as one delivered as a
    three-layer GeoPackage, and everything downstream cannot tell which it was.
    """
    return [
        'ogr2ogr',
        '-f', 'PostgreSQL', dsn,
        source_arg,
        # See the file: it is the list of what the database is given, and the
        # only part that changes if the source format changes again.
        '-sql', sql_arg,
        '-dialect', 'SQLITE',
        '-nln', spec.staging_table,
        '-overwrite' if index == 0 else '-append',
        '-t_srs', TARGET_SRID,
        '-nlt', source_layer.geometry_type,
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
    """Run the pinned image, with the extract and the SQL bind-mounted into it.

    --network host because the database it loads is on the host: either the
    compose Postgres or, for a developer with a tunnel open, a deployed one.
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
