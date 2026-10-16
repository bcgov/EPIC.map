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
"""What the ingest needs to know about a layer, as against what serving needs.

Kept apart from LOCAL_LAYERS: that registry exists to be the reason a table
name may be interpolated into SQL, and a GDAL geometry type or a lock key would
blur the promise its comment makes.

`object_name` holds the two together and must be a key of LOCAL_LAYERS,
asserted at import so a spec for an unserved layer cannot load at all.
"""

from dataclasses import dataclass
from typing import Optional, Tuple

from . import LOCAL_LAYERS


@dataclass(frozen=True)
class SourceLayer:
    """One layer inside the extract, and how to read it.

    A GeoPackage holds several in one file, a shapefile one per file, so the
    ingest takes a list either way.
    """

    # The select's FROM is what actually chooses the layer; this is here so
    # the ingest can name it, and so a test can catch the two disagreeing.
    name: str
    # A filename in the spec's sql_dir.
    select: str
    # The -nlt value. PROMOTE_TO_MULTI for a mixed single/multi source;
    # MULTIPOLYGON where the target column is polygons only.
    geometry_type: str


@dataclass(frozen=True)
class S3Source:
    """Where EAO puts this layer's delivery in object storage.

    Fixed keys, not a prefix scan: the files are overwritten in place, and "has
    anything changed" is the sha256 of the bytes either way. A newest-wins scan
    would also have to decide about a half-uploaded pair.

    Keys are paths within the bucket, with no leading slash.
    """

    # One per SourceLayer on the spec, in the same order. A layer delivered as
    # separate files names each of them.
    sources: Tuple[str, ...]
    # The .lyrx beside them, carrying the symbology.
    lyrx: str


@dataclass(frozen=True)
class RowIdentity:
    """How the ingest tells one staged feature from another.

    All three answer "what is a row of this layer", so they travel together.
    """

    # The staged column identifying a feature. compare() counts by it.
    key: str
    # What changes are listed by, a name being what a reader recognises.
    label: str
    # Whether the rows are a flattened join carrying one geometry many times,
    # as the consultation areas are: 415 rows for 298 areas.
    fold_duplicates: bool


@dataclass(frozen=True)
# One field per thing that differs between layers. The count is the point of
# the class: the alternative is that many arguments threaded through a script.
class IngestSpec:  # pylint: disable=too-many-instance-attributes
    """One layer's half of the ingest: what changes between layers, and nothing else."""

    # The name the rest of the application knows this layer by. Must be a key of
    # LOCAL_LAYERS.
    object_name: str
    # Directory under scripts/sql/ holding validate.sql, transform.sql and the
    # per-source selects. Fixed filenames, so the spec does not carry them.
    sql_dir: str
    # Read in order. The first is staged with -overwrite and the rest -append,
    # which is how three shapefiles land in one staging table.
    sources: Tuple[SourceLayer, ...]
    # Distinct per layer: a shared key makes one layer's load look, to
    # another's, like a second copy of itself - a silent no-op on a schedule.
    lock_key: int
    identity: RowIdentity
    # What a row of this layer is, for the sentences the guard writes.
    noun: str
    # The staged column whose distinct values the .lyrx's classes are checked
    # against.
    style_coverage_column: str
    # None for a layer only ever loaded from local files: --from-s3 refuses
    # such a spec rather than guessing a key.
    s3: Optional[S3Source] = None

    @property
    def staging_table(self) -> str:
        """Where ogr2ogr puts the extract before it is checked."""
        return f'cache.{self.sql_dir}_src'

    @property
    def target_table(self) -> str:
        """The table the transform writes, and the map reads."""
        return LOCAL_LAYERS[self.object_name].table


PIP_CONSULTATION_AREAS = IngestSpec(
    object_name='WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP',
    sql_dir='pip_consultation_areas',
    sources=(
        SourceLayer(
            # The GeoPackage also carries FirstNationsLabels, a byte-for-byte
            # duplicate; the select names this one in its FROM.
            name='FirstNationsOutlines',
            select='source_select.sql',
            geometry_type='MULTIPOLYGON',
        ),
    ),
    lock_key=0x9195C0A5,
    identity=RowIdentity(
        key='cnsltn_area_guid',
        label='cnsltn_area_name',
        # The extract is an area x contact join: 415 rows carrying 298 areas.
        fold_duplicates=True,
    ),
    noun='consultation areas',
    style_coverage_column='cnsltn_area_name',
    # Renamed from what EAO exports (FirstNationsData.gpkg and 'First Nations
    # PIP Consultation Areas - Outlined.lyrx') so the pair reads as a pair and
    # no key carries spaces. This is the convention EAO publishes to, not one
    # read off the bucket: confirm it with the GIS team before enabling the
    # CronJob anywhere the map is relied on.
    s3=S3Source(
        sources=('gis_db/PIP_CONSULTATION_AREAS.gpkg',),
        lyrx='gis_db/PIP_CONSULTATION_AREAS.lyrx',
    ),
)


INGEST_SPECS = {
    'pip': PIP_CONSULTATION_AREAS,
}


def _check_s3(name: str, spec: IngestSpec):
    """Fail at import on an S3 source that would go wrong halfway through a run.

    All of these are silent at 09:00: too few keys stages fewer layers than the
    spec describes, a leading slash reads as a permissions problem, and two
    keys sharing a basename land on each other in one temp directory.
    """
    source = spec.s3
    if source is None:
        return

    if len(source.sources) != len(spec.sources):
        raise RuntimeError(
            f'ingest spec {name!r} reads {len(spec.sources)} source layer(s) '
            f'but names {len(source.sources)} S3 key(s)'
        )

    keys = [*source.sources, source.lyrx]
    for key in keys:
        if not key or not key.strip():
            raise RuntimeError(f'ingest spec {name!r} has an empty S3 key')
        if key.startswith('/'):
            raise RuntimeError(
                f'ingest spec {name!r} has S3 key {key!r}; keys are relative to '
                f'the bucket and take no leading slash'
            )

    basenames = [key.rsplit('/', 1)[-1] for key in keys]
    if len(set(basenames)) != len(basenames):
        raise RuntimeError(
            f'ingest spec {name!r} has S3 keys sharing a filename {sorted(basenames)}; '
            f'they are downloaded into one directory and would overwrite each other'
        )


def _check_specs():
    """Fail at import if two specs would collide, or one names nothing served.

    Both errors are silent: a shared lock key is a scheduled no-op, and an
    unserved object_name is an ingest into a table no tile reads.
    """
    keys = {}
    for name, spec in INGEST_SPECS.items():
        if spec.object_name not in LOCAL_LAYERS:
            raise RuntimeError(
                f'ingest spec {name!r} names {spec.object_name!r}, which is '
                f'not a layer LOCAL_LAYERS serves'
            )
        if spec.lock_key in keys:
            raise RuntimeError(
                f'ingest specs {keys[spec.lock_key]!r} and {name!r} share '
                f'lock key {spec.lock_key:#x}'
            )
        keys[spec.lock_key] = name
        _check_s3(name, spec)


_check_specs()
