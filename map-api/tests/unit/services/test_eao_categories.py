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
"""The colours and the style the EAO categories are drawn with.

The prototype (`epic-map-prototype/js/eao-components.js`) is where this
symbology was agreed, so these pin what a change should have to be deliberate
about: the colours Maria set, and footprints being a layer of their own rather
than a branch in one ramp. The precedence is SQL, and is tested as SQL in
test_eao_category_sql.py.
"""

from map_api.services.local_layer_service.eao_categories import (
    AMENDMENT, CATEGORIES, COMPONENT_CATEGORIES, FOOTPRINT, LINE_WIDTH, POINT_RADIUS, PROJECT_COMPONENT,
    VALUE_COMPONENT, amendment_sql, category_case_sql, eao_style, style_manifest)


def test_the_palette_is_the_one_maria_set():
    """Okabe-Ito, not to be substituted."""
    assert FOOTPRINT.fill == '#0072B2'
    assert PROJECT_COMPONENT.fill == '#E69F00'
    assert VALUE_COMPONENT.fill == '#009E73'
    assert AMENDMENT.fill == '#CC79A7'
    assert FOOTPRINT.fill_opacity == 0.30
    for category in COMPONENT_CATEGORIES:
        assert category.fill_opacity == 0.35


def test_the_widths_match_the_prototype():
    """Footprint 1.6, components 1.4, lines 2.2, points radius 5."""
    assert FOOTPRINT.stroke_width == 1.6
    for category in COMPONENT_CATEGORIES:
        assert category.stroke_width == 1.4
    assert LINE_WIDTH == 2.2
    assert POINT_RADIUS == 5.0


def test_fill_and_stroke_are_the_same_hue():
    """Only the uploaded-layer style, which is not ours, outlines darker."""
    for category in CATEGORIES:
        assert category.fill == category.stroke


def test_footprints_are_their_own_layer_not_a_branch():
    """This is what stops the categories colliding."""
    layers = {layer['id']: layer for layer in eao_style()['layers']}
    assert layers['footprint-fill']['paint']['fill-color'] == FOOTPRINT.fill
    assert layers['footprint-fill']['filter'] == [
        '==', ['get', 'style_category'], 'footprint']
    # The component layers exclude them, so no footprint draws twice.
    assert layers['component-fill']['filter'][2] == [
        '!=', ['get', 'style_category'], 'footprint']


def test_the_component_match_never_mentions_footprint():
    """A footprint branch there would be unreachable, and misleading."""
    layers = {layer['id']: layer for layer in eao_style()['layers']}
    for spec_id in ('component-fill', 'component-outline', 'line', 'point'):
        assert FOOTPRINT.slug not in repr(layers[spec_id]['paint'])


def test_every_component_category_is_in_the_component_match():
    """A category the style cannot match draws in MapLibre's own default."""
    fill = next(layer for layer in eao_style()['layers']
                if layer['id'] == 'component-fill')
    rendered = repr(fill['paint']['fill-color'])
    for category in COMPONENT_CATEGORIES[:-1]:
        assert category.slug in rendered
    assert COMPONENT_CATEGORIES[-1].fill in rendered


def test_the_style_covers_all_three_geometries():
    """One mixed-geometry table, so the specs are filtered by geometry type."""
    layers = eao_style()['layers']
    assert [layer['id'] for layer in layers] == [
        'footprint-fill', 'footprint-outline', 'component-fill',
        'component-outline', 'line', 'point']
    assert [layer['type'] for layer in layers] == [
        'fill', 'line', 'fill', 'line', 'line', 'circle']


def test_footprints_draw_under_the_components():
    """So a component is what a click lands on, as in the prototype."""
    order = [layer['id'] for layer in eao_style()['layers']]
    assert order.index('footprint-fill') < order.index('component-fill')
    assert order.index('footprint-outline') < order.index('component-fill')


def test_each_fill_is_drawn_under_its_own_outline():
    """On top it would wash out its own boundary."""
    order = [layer['id'] for layer in eao_style()['layers']]
    assert order.index('footprint-fill') < order.index('footprint-outline')
    assert order.index('component-fill') < order.index('component-outline')


def test_points_keep_a_white_ring():
    """A dot has to stay visible on both basemaps."""
    point = next(layer for layer in eao_style()['layers'] if layer['id'] == 'point')
    assert point['paint']['circle-stroke-color'] == '#FFFFFF'
    assert point['paint']['circle-stroke-width'] == 1.5
    assert point['paint']['circle-radius'] == POINT_RADIUS


def test_the_source_layer_is_left_for_the_ingest():
    """The style says how to draw, not where from."""
    assert all(layer['sourceLayer'] is None for layer in eao_style()['layers'])


def test_the_manifest_lists_every_category():
    """The ingest records coverage, as it does for a translated .lyrx."""
    assert style_manifest()['classes'] == [c.slug for c in CATEGORIES]


def test_the_case_matches_the_python_rule():
    """The two readings of the rule have to agree, since both are used."""
    sql = category_case_sql()
    assert sql.index(FOOTPRINT.slug) < sql.index(AMENDMENT.slug)
    assert sql.index(AMENDMENT.slug) < sql.index(VALUE_COMPONENT.slug)
    assert f"ELSE '{PROJECT_COMPONENT.slug}'" in sql
    assert sql.rstrip().endswith('END')


def test_the_case_drops_the_footprint_branch_where_it_does_not_apply():
    """Naming a column ogr2ogr did not stage would fail the transform."""
    sql = category_case_sql(footprint=None)
    assert 'footprint' not in sql
    assert AMENDMENT.slug in sql
    assert VALUE_COMPONENT.slug in sql


def test_the_case_reads_the_columns_it_is_given():
    """The point layer stages sub_catego and no footprint."""
    sql = category_case_sql(component='component', subcategory='sub_catego',
                            footprint=None)
    assert 'coalesce(component' in sql
    assert 'coalesce(sub_catego' in sql
    assert 'coalesce(sub_catego' in amendment_sql('sub_catego')
