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

The structural checks live in each layer's validate.sql, being true or false
on their own terms. What is here needs judgement: comparing the new extract
against the stored one and deciding whether the difference is a refresh or a
mistake.

Pure functions over plain counts, so the thresholds are testable without a
database.
"""

from dataclasses import dataclass, field


# How much smaller a new extract may be before it is refused. Half the size is
# the shape of a truncated download. 0.9 leaves room for a handful of genuine
# retirements; past it, --allow-shrink puts the decision on a person.
DEFAULT_MIN_RATIO = 0.9


class CannotRunError(Exception):
    """The ingest could not be attempted. A system problem, not a data one.

    Here rather than in the script because the modules that raise it are
    importable and the script is not. A refusal means look at the file; this
    means look at the ingest. They exit 1 and 2, and conflating them makes a
    failing cron unreadable.
    """


@dataclass
class LoadComparison:
    """The staged extract set against what is already stored."""

    existing_areas: int
    staged_areas: int
    existing_vertices: int
    staged_vertices: int
    # Area names, for reporting. Empty on a first load.
    added: list = field(default_factory=list)
    removed: list = field(default_factory=list)
    changed: list = field(default_factory=list)

    @property
    def is_first_load(self) -> bool:
        """Nothing is stored yet, so there is nothing to protect."""
        return self.existing_areas == 0


@dataclass
class StyleCoverage:
    """How much of the staged data the style knows how to draw."""

    # Values the style has no class for, which would draw in its default symbol.
    unmatched: list = field(default_factory=list)
    # How many matched, separating a style a little behind the data from the
    # wrong file entirely.
    matched: int = 0


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

    `noun` is what one row of this layer is called, so the sentences read as
    being about the layer.
    """
    assessment = Assessment()

    if comparison.is_first_load:
        # Nothing stored, so nothing to lose. The SQL checks have run.
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

    # Geometry can collapse without the area count moving: an export that
    # wrote centroids, or simplified far harder than the last.
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

    Matching nothing is the wrong file, and would paint the layer in the
    default symbol - a design choice, to look at. Missing a few names is a
    style behind the data: worth saying, not worth blocking.
    """
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


def _sample(names: list, limit: int = 5) -> str:
    """Join the first few names, so a warning stays one line."""
    shown = ', '.join(repr(name) for name in names[:limit])
    if len(names) > limit:
        return f'{shown} and {len(names) - limit} more'
    return shown
