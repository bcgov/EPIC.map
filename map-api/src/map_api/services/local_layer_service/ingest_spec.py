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
"""What the ingest needs to know about a layer, as opposed to what serving it needs.

Kept apart from LOCAL_LAYERS deliberately. That registry is read on every tile
request, and its one job is to be the reason a table name may be interpolated
into SQL: everything on it is something the serving path reads. A GDAL geometry
type and an advisory lock key are neither, and putting them there would blur the
property the comment over LOCAL_LAYERS is making a promise about.

The two are held together by `object_name`, which must be a key of LOCAL_LAYERS -
asserted at import time below, so a spec for a layer nothing serves cannot be
loaded at all rather than failing at the end of an ingest.
"""

from dataclasses import dataclass
from typing import Optional, Tuple

from . import LOCAL_LAYERS


@dataclass(frozen=True)
class SourceLayer:
    """One layer inside the extract, and how to read it.

    A GeoPackage carries several of these in one file and a shapefile carries
    one per file, so the ingest takes a list either way and the difference stops
    at the paths on the command line.
    """

    # The layer name inside the extract. It also appears in the FROM clause of
    # the select below, which is what actually chooses it - this is here so the
    # ingest can say which layer it is staging, and so the two cannot silently
    # disagree without somebody noticing.
    name: str
    # A filename in the spec's sql_dir.
    select: str
    # The -nlt value. PROMOTE_TO_MULTI for a mixed single/multi source;
    # MULTIPOLYGON where the target column is polygons only.
    geometry_type: str


@dataclass(frozen=True)
class StyleSource:
    """Where a layer's MapLibre style comes from.

    Two kinds, because the two layers we have want opposite things. A warehouse
    layer's symbology genuinely lives in ArcGIS - the consultation areas carry
    299 unique-value classes nobody would hand-write - so it is translated from
    the .lyrx that ships beside the extract. A layer whose palette is a product
    decision, written down and reviewed, is better read from a file in this
    repository than from whatever an export happened to be saved with.
    """

    # 'lyrx' to translate the delivered layer file, 'spec' to read a style
    # document checked in beside the service.
    kind: str
    # For kind='spec': the filename in styles/. Unused for 'lyrx', which is
    # handed the path on the command line.
    path: Optional[str] = None
    # The staged column whose distinct values the style's classes are checked
    # against. None means there is no coverage check to run - which is the case
    # for a checked-in spec, where there are no classes to match and the guard
    # would otherwise refuse every load.
    coverage_column: Optional[str] = None
    # A palette document in styles/ holding the colours this layer is required to
    # draw in. Set where the symbology is a stated decision rather than the GIS
    # specialist's own: the .lyrx is still what gets translated, and this is what
    # the translation is checked against before it is allowed to replace what is
    # stored. None where there is nothing to check it against.
    palette: Optional[str] = None


@dataclass(frozen=True)
class S3Source:
    """Where EAO puts this layer's delivery in object storage.

    Fixed keys rather than a scan of a prefix. The files are overwritten in place
    on each re-export, so the key is stable, and "has anything changed" is
    answered by the sha256 of the bytes - the same question, answered the same
    way, as for a file somebody handed over by hand. A newest-wins scan would
    also have to decide what to do about a half-uploaded pair, and there is no
    answer to that which is better than not asking.

    Keys are paths within the bucket, with no leading slash.
    """

    # One per SourceLayer on the spec, in the same order. A layer delivered as
    # separate files names each of them.
    sources: Tuple[str, ...]
    # The .lyrx beside them, for a layer styled from one. None where the
    # symbology is a document in this repository instead.
    lyrx: Optional[str] = None
    # None means the configured S3_BUCKET. Set only where a layer is delivered
    # somewhere other than the one this service is pointed at.
    bucket: Optional[str] = None


@dataclass(frozen=True)
class RowIdentity:
    """How the ingest tells one staged feature from another.

    All three are about the same question - what is a row of this layer - which
    is why they travel together rather than as three fields on the spec.
    """

    # The staged column identifying a feature. compare() counts by it.
    key: str
    # The staged column naming it in a report. Changes are listed by this
    # because a name is what a person reading the report can recognise.
    label: str
    # Whether the staged rows are a flattened join carrying one geometry many
    # times, as the consultation areas are: 415 rows for 298 areas. False counts
    # rows as they come.
    fold_duplicates: bool


@dataclass(frozen=True)
# Eight fields, one per thing that differs between layers. The count is the point
# of the class, not a smell in it: the alternative is eight arguments threaded
# through the script, which is what this replaced.
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
    # Distinct per layer. A shared key would mean an ingest that overlaps
    # another layer's finds the lock held, decides a run is already in progress
    # and exits 0 having loaded nothing - a silent no-op on a schedule.
    lock_key: int
    identity: RowIdentity
    # What a row of this layer is, for the sentences the guard writes.
    noun: str
    style: StyleSource
    # Where the scheduled ingest fetches this layer from. None for a layer that
    # is only ever loaded from files on a developer's machine: --from-s3 refuses
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
    style=StyleSource(kind='lyrx', coverage_column='cnsltn_area_name'),
    # The delivery is named here rather than where it was exported from: the
    # files arrive as FirstNationsData.gpkg and 'First Nations PIP Consultation
    # Areas - Outlined.lyrx', and are published under these names instead. Two
    # reasons - the pair should say which layer it is and be recognisable as a
    # pair, and a key with spaces in it is legal but awkward in every shell,
    # log line and URL it ever appears in.
    #
    # This is the convention EAO publishes to, not one we read off the bucket:
    # confirm it with the GIS team before the CronJob is enabled anywhere the
    # map is being relied on.
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

    All four of these are silent at 09:00 with nobody watching: the wrong number
    of keys stages fewer layers than the spec describes, because stage() zips the
    two lists together; a missing .lyrx key downloads nothing and raises at the
    style step, after the transfer; a leading slash asks for an object literally
    named '/gis_db/...', which comes back looking like a permissions problem; and
    two keys sharing a basename land on each other in the one temp directory.
    """
    source = spec.s3
    if source is None:
        return

    if len(source.sources) != len(spec.sources):
        raise RuntimeError(
            f'ingest spec {name!r} reads {len(spec.sources)} source layer(s) '
            f'but names {len(source.sources)} S3 key(s)'
        )

    wants_lyrx = spec.style.kind == 'lyrx'
    if wants_lyrx and not source.lyrx:
        raise RuntimeError(
            f'ingest spec {name!r} is styled from a .lyrx but names no S3 key for one'
        )
    if source.lyrx and not wants_lyrx:
        raise RuntimeError(
            f'ingest spec {name!r} names a .lyrx key but its style comes from '
            f'{spec.style.kind!r}, so nothing would read it'
        )

    keys = list(source.sources) + ([source.lyrx] if source.lyrx else [])
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

    Cheap to run and the errors it catches are all silent ones: a lock key
    shared with another layer is a scheduled no-op, and an object_name nothing
    serves is an ingest that succeeds into a table no tile will ever read.
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
