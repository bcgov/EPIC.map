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
"""Tests for the .lyrx to MapLibre paint translation.

These are the assertions standing between us and a map that looks deliberate
and is wrong: a colour off by a channel, a width off by a quarter, or a match
key quietly tidied all draw perfectly well and do not match what BC staff see.

No database, no app, no fixtures - the translation is pure, and the tests build
CIM by hand so each one says which part of the shape it is about.
"""

import pytest

from map_api.services.local_layer_service.lyrx import UnsupportedRendererError, unique_value_paint


def stroke(colour, width=3, cap='Round', join='Round'):
    """Build a CIMSymbolReference wrapping one solid stroke."""
    return {
        'type': 'CIMSymbolReference',
        'symbol': {
            'type': 'CIMPolygonSymbol',
            'symbolLayers': [{
                'type': 'CIMSolidStroke',
                'enable': True,
                'capStyle': cap,
                'joinStyle': join,
                'width': width,
                'color': {'type': 'CIMRGBColor', 'values': [*colour, 100]},
            }],
        },
    }


def filled(colour, fill_colour=None, fill_alpha=35, width=3):
    """Build a CIMSymbolReference with a translucent fill under its stroke.

    The shape Maria's table describes: same hue for both, the fill translucent.
    """
    symbol = stroke(colour, width)
    symbol['symbol']['symbolLayers'].insert(0, {
        'type': 'CIMSolidFill',
        'enable': True,
        'color': {
            'type': 'CIMRGBColor',
            'values': [*(fill_colour or colour), fill_alpha],
        },
    })
    return symbol


def unique_value_class(value, colour, width=3, visible=True, symbol=None):
    """One class of a CIMUniqueValueRenderer."""
    return {
        'type': 'CIMUniqueValueClass',
        'label': value,
        'symbol': symbol or stroke(colour, width),
        'values': [{'type': 'CIMUniqueValue', 'fieldValues': [value]}],
        'visible': visible,
    }


def layer(classes, field='CNSLTN_AREA_NAME', **overrides):
    """Build a CIMFeatureLayer carrying `classes`, with defaults to override."""
    definition = {
        'type': 'CIMFeatureLayer',
        'name': 'Test Layer',
        'minScale': 6000000,
        'transparency': 20,
        'renderer': {
            'type': 'CIMUniqueValueRenderer',
            'fields': [field],
            'groups': [{'classes': classes}],
            'useDefaultSymbol': True,
            'isDefaultSymbolVisible': True,
            'defaultSymbol': stroke([0, 0, 0]),
        },
    }
    definition.update(overrides)
    return definition


def only_layer(style):
    """Return the one MapLibre layer an outline-only renderer produces.

    A style is an ordered list of layer specs, because a translucent polygon
    needs a fill and a line over the same tile. An outline-only renderer is the
    list of one, and these tests are about what goes in it.
    """
    assert len(style['layers']) == 1
    return style['layers'][0]


def test_the_style_is_a_source_and_an_ordered_list_of_layers():
    """The shape the endpoint promises, and the client loops over.

    An outline-only renderer produces one layer, but it produces it as a list,
    so a polygon style adding a fill beneath the line is a longer list rather
    than a different document.
    """
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert set(style) == {'source', 'layers'}
    assert isinstance(style['layers'], list)

    drawn = only_layer(style)
    assert drawn['id'] == 'line'
    assert drawn['type'] == 'line'
    # The ingest fills this in; the translator does not know the table.
    assert drawn['sourceLayer'] is None


def test_builds_a_match_on_the_renderer_field():
    """Colours are a match expression over the field the renderer keys on."""
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [0, 92, 230]),
        unique_value_class('B', [230, 0, 0]),
    ]))

    assert only_layer(style)['paint']['line-color'] == [
        'match', ['get', 'cnsltn_area_name'],
        'A', '#005CE6',
        'B', '#E60000',
        '#000000',
    ]


def test_lowercases_the_field_name():
    """ogr2ogr writes lowercase columns, so the .lyrx spelling would match nothing."""
    style, manifest = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert only_layer(style)['paint']['line-color'][1] == ['get', 'cnsltn_area_name']
    assert manifest['field'] == 'cnsltn_area_name'


def test_keeps_class_order():
    """A match is order independent, but a diff against the .lyrx is not."""
    _, manifest = unique_value_paint(layer([
        unique_value_class('third', [1, 1, 1]),
        unique_value_class('first', [2, 2, 2]),
        unique_value_class('second', [3, 3, 3]),
    ]))

    assert manifest['classes'] == ['third', 'first', 'second']


def test_preserves_a_trailing_space_in_a_class_value():
    """`'Bridge River '` is the real warehouse value, not a typo to tidy.

    Trimming it here stops the class matching and drops that territory to the
    default symbol. A shapefile cannot show this, because DBF pads text fields
    and a real trailing space is indistinguishable from the padding.
    """
    style, manifest = unique_value_paint(
        layer([unique_value_class('Bridge River ', [0, 92, 230])])
    )

    assert manifest['classes'] == ['Bridge River ']
    assert only_layer(style)['paint']['line-color'][2] == 'Bridge River '


def test_converts_stroke_width_from_points_to_pixels():
    """3pt is 4px; using the number unconverted draws every boundary thinner."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0], width=3)]))

    assert only_layer(style)['paint']['line-width'] == 4.0


def test_names_only_the_widths_that_differ():
    """The common width is the fallback, so the expression stays short."""
    style, _ = unique_value_paint(layer([
        unique_value_class('ordinary', [0, 0, 0], width=3),
        unique_value_class('thick', [0, 0, 0], width=5),
    ]))

    assert only_layer(style)['paint']['line-width'] == [
        'match', ['get', 'cnsltn_area_name'],
        'thick', 6.667,
        4.0,
    ]


def test_width_is_never_zoom_interpolated():
    """No referenceScale, so ArcGIS strokes at one width at every zoom."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert 'interpolate' not in str(only_layer(style)['paint']['line-width'])


def test_layer_transparency_becomes_one_line_opacity():
    """20% transparent is 0.8 opaque, once, rather than in every colour."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert only_layer(style)['paint']['line-opacity'] == 0.8
    assert only_layer(style)['paint']['line-color'][3] == '#000000'  # no alpha folded in


def test_an_opaque_layer_sets_no_opacity():
    """Nothing to say, so nothing is said."""
    style, _ = unique_value_paint(
        layer([unique_value_class('A', [0, 0, 0])], transparency=0)
    )

    assert 'line-opacity' not in only_layer(style)['paint']


def test_a_visible_default_symbol_is_the_match_fallback():
    """An unmatched value draws black, as ArcGIS draws it."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [1, 2, 3])]))

    assert only_layer(style)['paint']['line-color'][-1] == '#000000'


def test_an_invisible_default_symbol_falls_back_to_nothing():
    """Nothing to draw, so the fallback is a stroke nobody can see."""
    definition = layer([unique_value_class('A', [1, 2, 3])])
    definition['renderer']['isDefaultSymbolVisible'] = False

    style, _ = unique_value_paint(definition)

    assert only_layer(style)['paint']['line-color'][-1] == 'rgba(0,0,0,0)'


def test_min_scale_becomes_a_min_zoom():
    """1:6,000,000 is where this layer starts drawing, which is zoom 6."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert style['source']['minZoom'] == 6


def test_no_min_scale_means_no_floor():
    """A layer with no limit draws wherever the source allows."""
    style, _ = unique_value_paint(
        layer([unique_value_class('A', [0, 0, 0])], minScale=None)
    )

    assert style['source']['minZoom'] is None


def test_carries_cap_and_join_into_layout():
    """Visible wherever a boundary turns, which on these outlines is everywhere."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert only_layer(style)['layout'] == {'line-cap': 'round', 'line-join': 'round'}


def test_skips_a_class_the_renderer_hides():
    """An invisible class draws nothing, so it should match nothing."""
    _, manifest = unique_value_paint(layer([
        unique_value_class('shown', [0, 0, 0]),
        unique_value_class('hidden', [0, 0, 0], visible=False),
    ]))

    assert manifest['classes'] == ['shown']


@pytest.mark.parametrize('renderer_type', ['CIMSimpleRenderer', 'CIMClassBreaksRenderer'])
def test_refuses_a_renderer_it_does_not_translate(renderer_type):
    """Better to fail the ingest than to publish half a style."""
    definition = layer([unique_value_class('A', [0, 0, 0])])
    definition['renderer']['type'] = renderer_type

    with pytest.raises(UnsupportedRendererError):
        unique_value_paint(definition)


def test_a_fill_becomes_its_own_layer_under_the_outline():
    """Maria's table is a translucent fill plus a stroke, which is two layers.

    Under, not over: a translucent fill drawn on top washes out the boundary it
    belongs to, and tints the neighbouring area's edge where two of them touch.
    """
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [0, 114, 178], symbol=filled([0, 114, 178])),
    ]))

    assert [one['id'] for one in style['layers']] == ['fill', 'line']
    assert [one['type'] for one in style['layers']] == ['fill', 'line']


def test_the_fill_colour_is_a_match_on_the_same_field():
    """One field keys both layers, so a class cannot colour them differently."""
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [0, 114, 178], symbol=filled([0, 114, 178])),
        unique_value_class('B', [230, 159, 0], symbol=filled([230, 159, 0])),
    ]))

    fill = style['layers'][0]
    assert fill['paint']['fill-color'] == [
        'match', ['get', 'cnsltn_area_name'],
        'A', '#0072B2',
        'B', '#E69F00',
        'rgba(0,0,0,0)',
    ]


def test_fill_alpha_becomes_fill_opacity_not_a_baked_colour():
    """Maria's table states colour and opacity separately, and so does MapLibre.

    35% alpha on the symbol with 20 layer transparency is 0.35 * 0.8.
    """
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [0, 114, 178],
                           symbol=filled([0, 114, 178], fill_alpha=35)),
    ]))

    fill = style['layers'][0]
    assert fill['paint']['fill-opacity'] == 0.28
    # The hue itself stays a plain hex, so it can be compared to the table.
    assert fill['paint']['fill-color'][3] == '#0072B2'


def test_a_fill_and_stroke_can_differ_in_colour():
    """The table's "uploaded shapefiles" row is a grey fill with a darker outline."""
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [110, 110, 110],
                           symbol=filled([110, 110, 110], fill_colour=[74, 74, 74])),
    ]))

    assert style['layers'][0]['paint']['fill-color'][3] == '#4A4A4A'
    assert style['layers'][1]['paint']['line-color'][3] == '#6E6E6E'


def test_per_class_fill_opacity_becomes_a_match():
    """The table's footprint is 30% where the component rows are 35%."""
    style, _ = unique_value_paint(layer([
        unique_value_class('A', [0, 114, 178],
                           symbol=filled([0, 114, 178], fill_alpha=30)),
        unique_value_class('B', [230, 159, 0],
                           symbol=filled([230, 159, 0], fill_alpha=35)),
    ], transparency=0))

    assert style['layers'][0]['paint']['fill-opacity'] == [
        'match', ['get', 'cnsltn_area_name'], 'A', 0.3, 'B', 0.35, 1.0,
    ]


def test_an_outline_only_style_still_has_no_fill_layer():
    """The consultation areas must keep rendering exactly as they did."""
    style, _ = unique_value_paint(layer([unique_value_class('A', [0, 0, 0])]))

    assert [one['id'] for one in style['layers']] == ['line']
    assert 'fill-color' not in style['layers'][0]['paint']


def test_refuses_a_style_that_fills_only_some_classes():
    """One fill layer covers the whole source, so the rest would need a guess."""
    definition = layer([
        unique_value_class('A', [0, 0, 0], symbol=filled([0, 0, 0])),
        unique_value_class('B', [1, 1, 1]),
    ])

    with pytest.raises(UnsupportedRendererError, match='fill all of them or none'):
        unique_value_paint(definition)


def test_refuses_a_symbol_layer_it_does_not_translate():
    """A hatch, a picture fill or a marker is not a colour plus a width."""
    definition = layer([unique_value_class('A', [0, 0, 0])])
    definition['renderer']['groups'][0]['classes'][0]['symbol']['symbol'][
        'symbolLayers'
    ].append({'type': 'CIMHatchFill', 'enable': True})

    with pytest.raises(UnsupportedRendererError, match='CIMHatchFill'):
        unique_value_paint(definition)


def test_refuses_a_symbol_with_two_fills():
    """A stacked fill has no single colour to translate to."""
    definition = layer([
        unique_value_class('A', [0, 0, 0], symbol=filled([0, 0, 0])),
    ])
    definition['renderer']['groups'][0]['classes'][0]['symbol']['symbol'][
        'symbolLayers'
    ].insert(0, {'type': 'CIMSolidFill', 'enable': True,
                 'color': {'type': 'CIMRGBColor', 'values': [9, 9, 9, 100]}})

    with pytest.raises(UnsupportedRendererError, match='at most one'):
        unique_value_paint(definition)


def test_a_disabled_fill_is_not_a_fill():
    """A switched-off symbol layer stays in the file and draws nothing."""
    definition = layer([
        unique_value_class('A', [0, 0, 0], symbol=filled([0, 0, 0])),
    ])
    definition['renderer']['groups'][0]['classes'][0]['symbol']['symbol'][
        'symbolLayers'
    ][0]['enable'] = False

    style, _ = unique_value_paint(definition)
    assert [one['id'] for one in style['layers']] == ['line']


def test_refuses_a_renderer_keyed_on_more_than_one_field():
    """A two-field key is a different match expression than this builds."""
    definition = layer([unique_value_class('A', [0, 0, 0])])
    definition['renderer']['fields'] = ['ONE', 'TWO']

    with pytest.raises(UnsupportedRendererError):
        unique_value_paint(definition)
