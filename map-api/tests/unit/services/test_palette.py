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
"""The palette is Okabe-Ito, and these are what stop it drifting.

The colours are an accessibility requirement, not a preference: the ticket says
not to substitute other hues. A palette that has drifted draws a map that works
perfectly and is wrong for the people it was chosen for, which is exactly the
failure the .lyrx translation refuses to make - so it is checked the same way.
"""

import json
from pathlib import Path

from map_api.services.local_layer_service.ingest import check_palette


PALETTE_PATH = (
    Path(__file__).resolve().parents[3] /
    'src' / 'map_api' / 'services' / 'local_layer_service' / 'styles' /
    'eao_components_palette.json'
)

PALETTE = json.loads(PALETTE_PATH.read_text(encoding='utf-8'))


def observed(**overrides):
    """Build what a .lyrx translation produced, matching the palette by default."""
    drawn = {
        key: {
            'fill': spec['fill'],
            'fillOpacity': spec['fillOpacity'],
            'stroke': spec['stroke'],
            'strokeWidthPixels': spec['strokeWidthPixels'],
        }
        for key, spec in PALETTE['categories'].items()
    }
    for key, changes in overrides.items():
        drawn[key].update(changes)
    return drawn


def test_the_palette_file_holds_the_five_categories_from_the_ticket():
    """If a category goes missing the assertion silently stops covering it."""
    assert set(PALETTE['categories']) == {
        'footprint', 'project', 'value', 'amendment', 'uploaded',
    }


def test_the_okabe_ito_hues_are_exactly_the_ones_specified():
    """Written out here so a change to the palette has to change this too."""
    categories = PALETTE['categories']
    assert categories['footprint']['fill'] == '#0072B2'
    assert categories['project']['fill'] == '#E69F00'
    assert categories['value']['fill'] == '#009E73'
    assert categories['amendment']['fill'] == '#CC79A7'
    assert categories['uploaded']['fill'] == '#6E6E6E'
    # Only 'uploaded' outlines in a different colour from its fill.
    assert categories['uploaded']['stroke'] == '#4A4A4A'
    for key in ('footprint', 'project', 'value', 'amendment'):
        assert categories[key]['stroke'] == categories[key]['fill']


def test_a_style_matching_the_palette_passes():
    """The case that has to stay quiet, or the check is noise."""
    assessment = check_palette(observed(), PALETTE)

    assert assessment.ok
    assert assessment.warnings == []


def test_a_drifted_hue_is_refused():
    """The failure this exists for: a re-export with a substituted colour."""
    assessment = check_palette(
        observed(value={'fill': '#00AA00'}), PALETTE,
    )

    assert not assessment.ok
    assert any('#00AA00' in r and '#009E73' in r for r in assessment.refusals)


def test_hex_case_is_not_a_difference():
    """Capitalisation need not agree for two hex colours to be the same colour."""
    assessment = check_palette(
        observed(footprint={'fill': '#0072b2', 'stroke': '#0072b2'}), PALETTE,
    )

    assert assessment.ok


def test_a_wrong_fill_opacity_is_refused():
    """The ticket says colours and fill opacity must match exactly."""
    assessment = check_palette(
        observed(project={'fillOpacity': 0.5}), PALETTE,
    )

    assert not assessment.ok
    assert any('50%' in r and '35%' in r for r in assessment.refusals)


def test_a_stroke_width_within_tolerance_is_allowed():
    """Widths are called a starting point, and points-to-pixels rounds."""
    assessment = check_palette(
        observed(project={'strokeWidthPixels': 1.43}), PALETTE,
    )

    assert assessment.ok


def test_a_stroke_width_well_outside_tolerance_is_refused():
    """Tolerance absorbs rounding, not a different number."""
    assessment = check_palette(
        observed(project={'strokeWidthPixels': 4.0}), PALETTE,
    )

    assert not assessment.ok
    assert any('4.0px' in r for r in assessment.refusals)


def test_a_category_the_palette_does_not_define_is_refused():
    """A sixth category has to be a decision, not something a .lyrx introduces.

    Maria's table has five rows and no Engage row, so this is the check that
    surfaces the question rather than letting an unreviewed hue onto the map.
    """
    drawn = observed()
    drawn['engage'] = {'fill': '#56B4E9', 'fillOpacity': 0.35}

    assessment = check_palette(drawn, PALETTE)

    assert not assessment.ok
    assert any('engage' in r for r in assessment.refusals)


def test_an_uncovered_category_only_warns():
    """A style that has not caught up is still right about what it does cover."""
    drawn = observed()
    del drawn['uploaded']

    assessment = check_palette(drawn, PALETTE)

    assert assessment.ok
    assert any('uploaded' in w for w in assessment.warnings)


def test_a_field_the_translation_did_not_produce_is_not_a_mismatch():
    """An outline-only style has no fill to compare, which is not a disagreement."""
    drawn = {'footprint': {'stroke': '#0072B2', 'strokeWidthPixels': 1.6}}

    assessment = check_palette(drawn, PALETTE)

    assert assessment.refusals == []


def test_several_disagreements_are_all_reported():
    """One re-export can drift in more than one place; listing one hides the rest."""
    assessment = check_palette(
        observed(
            value={'fill': '#00AA00'},
            amendment={'fillOpacity': 0.9},
        ),
        PALETTE,
    )

    assert len(assessment.refusals) >= 2
