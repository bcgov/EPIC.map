# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Tests for the guard on replacing a loaded extract.

The extract is refreshed by hand every so often, so this code runs against a
database that already holds a good copy. What it is protecting against is a
re-export that came out short or malformed replacing one that did not, which is
a failure nobody would notice until somebody opened the map.
"""

from map_api.services.local_layer_service.ingest import (
    DEFAULT_MIN_RATIO, NO_STYLE_COVERAGE, LoadComparison, StyleCoverage, assess)


FULL_CLASSES = 298


def covered(unmatched=None, matched=FULL_CLASSES) -> StyleCoverage:
    """Build a style that draws everything, unless told otherwise."""
    return StyleCoverage(unmatched=unmatched or [], matched=matched)


def comparison(staged_areas=298, existing_areas=298,
               staged_vertices=1_534_113, existing_vertices=1_534_113,
               **kwargs) -> LoadComparison:
    """Build a staged extract against a stored one, steady unless told otherwise."""
    return LoadComparison(
        existing_areas=existing_areas,
        staged_areas=staged_areas,
        existing_vertices=existing_vertices,
        staged_vertices=staged_vertices,
        **kwargs,
    )


def test_a_steady_refresh_is_allowed():
    """The same extract loaded again changes nothing and is fine."""
    assessment = assess(comparison(), covered())

    assert assessment.ok
    assert assessment.refusals == []


def test_a_first_load_is_allowed_whatever_its_size():
    """There is nothing stored to protect, so there is nothing to compare."""
    assessment = assess(
        comparison(staged_areas=3, existing_areas=0,
                   staged_vertices=90, existing_vertices=0),
        covered(matched=3),
    )

    assert assessment.ok


def test_an_extract_that_lost_most_of_its_areas_is_refused():
    """The failure this exists for: a truncated re-export replacing a good one."""
    assessment = assess(
        comparison(staged_areas=52, staged_vertices=239_500), covered(matched=52),
        noun='consultation areas',
    )

    assert not assessment.ok
    assert any('52 consultation areas' in r for r in assessment.refusals)


def test_the_refusal_is_phrased_in_the_layers_own_noun():
    """One guard serves every layer, so its sentences cannot name only one."""
    assessment = assess(
        comparison(staged_areas=52, staged_vertices=239_500), covered(matched=52),
        noun='components',
    )

    assert not assessment.ok
    assert any('52 components' in r for r in assessment.refusals)
    assert not any('consultation areas' in r for r in assessment.refusals)


def test_a_layer_with_no_style_classes_is_not_refused_for_matching_none():
    """A style read from a document in the repo has no classes to match.

    Running the coverage guard against one would find zero matches and refuse
    every load of that layer, which is the whole reason None is a value here.
    """
    assessment = assess(
        comparison(staged_areas=300, staged_vertices=1_600_000), NO_STYLE_COVERAGE,
    )

    assert assessment.ok
    assert not assessment.warnings


def test_losing_a_handful_of_areas_is_allowed():
    """The warehouse retires an area now and then; that is not a fault."""
    assessment = assess(
        comparison(staged_areas=295, staged_vertices=1_520_000), covered(matched=295),
    )

    assert assessment.ok


def test_growing_is_always_allowed():
    """New projects are the reason the extract is refreshed at all."""
    assessment = assess(
        comparison(staged_areas=340, staged_vertices=1_800_000),
        covered(),
    )

    assert assessment.ok


def test_allow_shrink_turns_the_refusal_into_a_warning():
    """A real reduction is loadable, but somebody has to say so."""
    assessment = assess(
        comparison(staged_areas=52, staged_vertices=239_500), covered(matched=52),
        allow_shrink=True,
    )

    assert assessment.ok
    assert any('--allow-shrink' in w for w in assessment.warnings)


def test_geometry_can_collapse_without_the_area_count_moving():
    """An export that simplified hard, or wrote centroids, keeps every area.

    Counting areas alone would wave this through, and the map would draw a
    province of coarse outlines that still looked deliberate.
    """
    assessment = assess(
        comparison(staged_vertices=90_000), covered(),
    )

    assert not assessment.ok
    assert any('vertices' in r for r in assessment.refusals)


def test_the_threshold_can_be_moved():
    """A caller who knows the extract is shrinking can say how far is fine."""
    shrunk = comparison(staged_areas=200, staged_vertices=1_030_000)

    assert not assess(shrunk, covered(matched=200)).ok
    assert assess(shrunk, covered(matched=200), min_ratio=0.5).ok


def test_a_style_matching_nothing_is_refused():
    """The wrong .lyrx paints every feature in the default symbol.

    That reads as a design choice rather than a fault, so it is worth stopping
    for rather than warning about.
    """
    assessment = assess(comparison(), covered(['A', 'B'], matched=0))

    assert not assessment.ok
    assert any('wrong .lyrx' in r for r in assessment.refusals)


def test_a_style_missing_a_few_names_is_only_a_warning():
    """The boundaries are still right, and a new style can be loaded later."""
    assessment = assess(
        comparison(), covered(['A New Nation', 'Another'], matched=296),
    )

    assert assessment.ok
    assert any('default symbol' in w for w in assessment.warnings)


def test_reports_what_changed():
    """The operator should be able to read the refresh, not diff it by hand."""
    assessment = assess(
        comparison(added=['New Area'], removed=['Gone Area'],
                   changed=['Moved Area']),
        covered(),
    )

    assert assessment.ok
    joined = ' '.join(assessment.warnings)
    assert 'New Area' in joined
    assert 'Gone Area' in joined
    assert 'Moved Area' in joined


def test_a_long_list_of_names_is_summarised():
    """A warning that runs to 246 names is one nobody reads."""
    assessment = assess(
        comparison(removed=[f'Area {n}' for n in range(246)]),
        covered(),
    )

    warning = next(w for w in assessment.warnings if 'no longer' in w)
    assert '241 more' in warning


def test_the_default_threshold_is_stated_once():
    """The script advertises this in --help, so it has to come from here."""
    assert 0 < DEFAULT_MIN_RATIO < 1
