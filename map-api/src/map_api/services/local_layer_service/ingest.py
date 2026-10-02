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
"""Whether a freshly staged extract may replace the one already loaded.

The extract is re-exported by hand every so often, as projects are added, so
the ingest is not a one-shot: it runs against a database that already holds a
good copy, and the question each time is whether the new file is better than
what is there or worse than it.

The structural checks - geometry present and valid, identifiers present, one
name per id - live in each layer's scripts/sql/<layer>/validate.sql, because
they are true or false on their own terms and belong in the same transaction as
the swap. What is here is the part that needs judgement: comparing the new
extract against the stored one and deciding whether the difference is a refresh
or a mistake.

Pure functions over plain counts, so the thresholds can be tested without a
database and argued about without running an ingest.
"""

from dataclasses import dataclass, field


# How much smaller a new extract may be before the ingest refuses it.
#
# An extract that grows, or holds steady, or loses an area or two as the
# warehouse retires them, is routine. One that arrives at half the size is the
# shape of a truncated download or a filtered export, and replacing a good copy
# with it is the failure this guard exists to prevent. 0.9 leaves room for a
# genuine handful of retirements while catching anything dramatic; a real
# reduction past it is allowed through with --allow-shrink, which puts the
# decision on the person who can look at the file.
DEFAULT_MIN_RATIO = 0.9


class CannotRunError(Exception):
    """The ingest could not be attempted. A system problem, not a data one.

    Here rather than in the script because the script is not importable from
    src/, and the modules that raise this - the S3 download, and anything else
    that fails before there is an extract to judge - are. The distinction it
    carries is the whole of the scheduler's vocabulary: a refusal means a bad
    export arrived and a person should look at the file, while this means the
    ingest itself is broken and a person should look at the ingest. They exit 1
    and 2 respectively, and conflating them makes a failing cron unreadable.
    """


@dataclass
class LoadComparison:
    """The staged extract set against what is already stored."""

    existing_areas: int
    staged_areas: int
    existing_vertices: int
    staged_vertices: int
    # Area names, for reporting. Empty on a first load, when there is nothing
    # to compare against.
    added: list = field(default_factory=list)
    removed: list = field(default_factory=list)
    changed: list = field(default_factory=list)

    @property
    def is_first_load(self) -> bool:
        """Nothing is stored yet, so there is nothing to protect."""
        return self.existing_areas == 0


@dataclass
class StyleCoverage:
    """How much of the staged data the style knows how to draw.

    `NONE` rather than zeros for a layer whose style is a document in this
    repository: it has no per-value classes, so there is no coverage to measure,
    and measuring it anyway would find nothing matched and refuse every load.
    """

    # Values the style has no class for, which would draw in its default symbol.
    unmatched: list = field(default_factory=list)
    # How many did match, which separates a style that has fallen a little
    # behind the data from one that is simply the wrong file.
    matched: int = 0
    # False where there are no classes to match against.
    checkable: bool = True


# A layer styled from a checked-in document, where there is nothing to check.
NO_STYLE_COVERAGE = StyleCoverage(checkable=False)


@dataclass
class Assessment:
    """What the guard concluded, and why."""

    # Each one a sentence saying what is wrong. Non-empty means do not load.
    refusals: list = field(default_factory=list)
    # Worth saying out loud, but not worth stopping for.
    warnings: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """Whether the staged extract may replace what is stored."""
        return not self.refusals


def _ratio(new: int, old: int) -> float:
    """Express `new` as a fraction of `old`, with no old meaning no constraint."""
    return 1.0 if old == 0 else new / old


def assess(
    comparison: LoadComparison,
    coverage: StyleCoverage,
    noun: str = 'areas',
    min_ratio: float = DEFAULT_MIN_RATIO,
    allow_shrink: bool = False,
) -> Assessment:
    """Decide whether the staged extract should replace the stored one.

    `noun` is what one row of this layer is called, so the sentences below read
    as being about the layer rather than about whichever one was written first.
    """
    assessment = Assessment()

    if comparison.is_first_load:
        # Nothing stored, so no comparison to make and nothing to lose. The
        # structural checks in SQL have already run.
        _assess_style(assessment, coverage)
        return assessment

    area_ratio = _ratio(comparison.staged_areas, comparison.existing_areas)
    vertex_ratio = _ratio(comparison.staged_vertices, comparison.existing_vertices)

    if area_ratio < min_ratio:
        message = (
            f'the extract holds {comparison.staged_areas} {noun} '
            f'against the {comparison.existing_areas} already loaded '
            f'({area_ratio:.0%})'
        )
        if allow_shrink:
            assessment.warnings.append(f'{message}; allowed by --allow-shrink')
        else:
            assessment.refusals.append(
                f'{message}. Re-export, or pass --allow-shrink if the '
                f'reduction is real.'
            )

    # Geometry can collapse without the area count moving at all - an export
    # that wrote centroids, or simplified far harder than the last one. The
    # count alone would not notice.
    if vertex_ratio < min_ratio:
        message = (
            f'the extract holds {comparison.staged_vertices:,} vertices '
            f'against the {comparison.existing_vertices:,} already loaded '
            f'({vertex_ratio:.0%}), so its geometry is coarser'
        )
        if allow_shrink:
            assessment.warnings.append(f'{message}; allowed by --allow-shrink')
        else:
            assessment.refusals.append(
                f'{message}. Re-export, or pass --allow-shrink if the '
                f'reduction is real.'
            )

    if comparison.removed:
        assessment.warnings.append(
            f'{len(comparison.removed)} {noun} are no longer in the extract: '
            f'{_sample(comparison.removed)}'
        )
    if comparison.added:
        assessment.warnings.append(
            f'{len(comparison.added)} {noun} are new: {_sample(comparison.added)}'
        )
    if comparison.changed:
        assessment.warnings.append(
            f'{len(comparison.changed)} {noun} changed shape: '
            f'{_sample(comparison.changed)}'
        )

    _assess_style(assessment, coverage)
    return assessment


def _assess_style(assessment: Assessment, coverage: StyleCoverage):
    """Judge the .lyrx against the names it will have to draw.

    A style that matches nothing is the wrong file, or one keyed on a field
    this extract does not have, and loading it would paint the whole layer in
    the default symbol - which reads as a design choice rather than a fault.
    A style that misses a few names is one that has fallen behind the data,
    which is worth saying and not worth blocking: the boundaries are still
    right, and a new .lyrx can be loaded on its own.

    An uncheckable coverage is not a failing one. A layer styled from a document
    in this repository has no per-value classes, so there is nothing to measure
    - and measuring it anyway would find zero matches and refuse every load of
    that layer.
    """
    if not coverage.checkable:
        return

    if coverage.matched == 0:
        assessment.refusals.append(
            'the style matches none of the area names in this extract; it is '
            'the wrong .lyrx, or it keys on a field the extract does not have'
        )
        return

    if coverage.unmatched:
        assessment.warnings.append(
            f'{len(coverage.unmatched)} area names have no class in the style '
            f'and will draw in its default symbol: {_sample(coverage.unmatched)}'
        )


# How far a translated width may sit from the palette's before it is a mismatch.
# The ticket calls the widths "a starting point" and says the colours and fill
# opacity must match exactly, so those are compared as given and this tolerance
# applies only to widths - enough to absorb the points-to-pixels conversion
# rounding, not enough to hide a different number.
WIDTH_TOLERANCE_PIXELS = 0.05


def check_palette(observed: dict, palette: dict) -> Assessment:
    """Check translated symbology against the palette that is supposed to define it.

    `observed` maps a palette category key to what the .lyrx actually produced:
    `fill`, `fillOpacity`, `stroke` and `strokeWidthPixels`, any of which may be
    absent. Returns an Assessment so the caller can fold it into the one it
    already has.

    A colour that disagrees is a refusal. The palette is Okabe-Ito and the ticket
    asks for it specifically because it is colourblind-safe, so a hue that has
    drifted is an accessibility regression that renders perfectly and looks
    deliberate - the same failure the renderer translation refuses to make.

    A category the style does not cover is only a warning: a delivery styling
    four of the five is one that has not caught up, and the four it does style
    are still right.
    """
    assessment = Assessment()
    categories = palette.get('categories') or {}

    unknown = sorted(set(observed) - set(categories))
    if unknown:
        assessment.refusals.append(
            f'the style carries categories the palette does not define: '
            f'{_sample(unknown)}'
        )

    for key in sorted(set(observed) & set(categories)):
        expected, actual = categories[key], observed[key]
        label = expected.get('label', key)

        for part in ('fill', 'stroke'):
            want, got = expected.get(part), actual.get(part)
            if got is not None and want is not None and str(got).upper() != str(want).upper():
                assessment.refusals.append(
                    f'{label}: the style draws its {part} {got} where the '
                    f'palette says {want}'
                )

        want, got = expected.get('fillOpacity'), actual.get('fillOpacity')
        if got is not None and want is not None and abs(got - want) > 1e-9:
            assessment.refusals.append(
                f'{label}: the style fills at {got:.0%} where the palette '
                f'says {want:.0%}'
            )

        want, got = expected.get('strokeWidthPixels'), actual.get('strokeWidthPixels')
        if got is not None and want is not None and abs(got - want) > WIDTH_TOLERANCE_PIXELS:
            assessment.refusals.append(
                f'{label}: the style strokes at {got}px where the palette '
                f'says {want}px'
            )

    missing = sorted(set(categories) - set(observed))
    if missing:
        assessment.warnings.append(
            f'{len(missing)} palette categories are not styled by this .lyrx: '
            f'{_sample(missing)}'
        )

    return assessment


def _sample(names: list, limit: int = 5) -> str:
    """Join the first few names, so a warning stays one line."""
    shown = ', '.join(repr(name) for name in names[:limit])
    if len(names) > limit:
        return f'{shown} and {len(names) - limit} more'
    return shown
