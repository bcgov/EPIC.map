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
"""ArcGIS .lyrx to MapLibre paint.

A .lyrx is a CIM layer document - plain JSON, whatever its extension suggests -
and this reads the renderer shapes we are given: a CIMUniqueValueRenderer over a
single string field, whose classes are solid strokes with an optional solid fill
beneath them. Anything else raises rather than guessing, because a style that
half-translates draws a map that looks deliberate and is wrong.

A class with a fill produces two MapLibre layers rather than one, which is why a
style is an ordered list of them: the fill goes under the outline, so a
translucent area does not wash out its own boundary or tint its neighbour's.

Nothing here touches Flask or the database, so the ingest script and the tests
can both call it directly.
"""

from dataclasses import dataclass
from dataclasses import field as dc_field
from typing import Any, Optional

from map_api.utils.scale import zoom_for_scale_denominator


# ArcGIS measures stroke width in points; MapLibre paints in CSS pixels, which
# are 1/96 inch against a point's 1/72. A 3pt outline is a 4px one, and using
# the number unconverted draws every boundary a quarter thinner than iMap.
POINTS_TO_PIXELS = 96 / 72

# Applied when a class carries no width of its own, and by the default symbol.
# 295 of the 299 classes in the consultation areas style are 3pt, so the width
# expression names only the handful that differ and leaves the rest to this.
DEFAULT_WIDTH_POINTS = 3

# A CIM stroke's colour is [r, g, b, alpha] with alpha out of 100, not 255.
CIM_ALPHA_MAX = 100

# What a class means when `isDefaultSymbolVisible` is false: the renderer draws
# nothing at all for a value it does not recognise. MapLibre has no "skip this
# feature" in a match, so the fallback is a stroke nobody can see.
INVISIBLE = 'rgba(0,0,0,0)'

CAP_STYLES = {'Round': 'round', 'Butt': 'butt', 'Square': 'square'}
JOIN_STYLES = {'Round': 'round', 'Miter': 'miter', 'Bevel': 'bevel'}


class UnsupportedRendererError(Exception):
    """The .lyrx carries a renderer this does not translate."""


def _hex_colour(colour: dict) -> str:
    """`#RRGGBB` for a CIMRGBColor.

    Alpha is not part of the hex. It is read separately by `_alpha` and hoisted
    into one opacity property, because MapLibre applies `fill-opacity` and
    `line-opacity` over the whole layer and folding the same number into
    hundreds of colours is one place to be wrong instead of many.
    """
    if colour.get('type') != 'CIMRGBColor':
        raise UnsupportedRendererError(
            f"only CIMRGBColor is translated, not {colour.get('type')}"
        )
    red, green, blue = (int(round(channel)) for channel in colour['values'][:3])
    return f'#{red:02X}{green:02X}{blue:02X}'


def _alpha(colour: dict) -> float:
    """Return a CIM colour's alpha as a 0-1 opacity, defaulting to fully opaque.

    Every stroke in the consultation areas style is alpha 100, so reading this
    changes nothing there. It matters for fills, where the translucency *is* the
    symbology rather than a layer-wide fade.
    """
    values = colour.get('values') or []
    if len(values) < 4:
        return 1.0
    return round(values[3] / CIM_ALPHA_MAX, 4)


def _symbol_parts(symbol: dict) -> tuple[Optional[dict], dict]:
    """Return the enabled fill and the enabled stroke of a CIMSymbolReference.

    A polygon symbol is a fill, a stroke, or both, and each becomes its own
    MapLibre layer. Anything with more than one of either is a stacked symbol -
    two strokes making a cased road, a pattern over a solid - and there is no
    single colour to translate it to, so it raises rather than picking one.
    """
    layers = (symbol.get('symbol') or {}).get('symbolLayers') or []
    enabled = [layer for layer in layers if layer.get('enable', True)]

    fills = [layer for layer in enabled if layer.get('type') == 'CIMSolidFill']
    strokes = [layer for layer in enabled if layer.get('type') == 'CIMSolidStroke']

    unknown = [
        layer.get('type') for layer in enabled
        if layer.get('type') not in ('CIMSolidFill', 'CIMSolidStroke')
    ]
    if unknown:
        # Hatch and picture fills, character and vector markers, gradients. Each
        # needs its own translation and none of them is a colour plus a width.
        raise UnsupportedRendererError(
            f'only CIMSolidFill and CIMSolidStroke are translated, not '
            f"{', '.join(sorted(set(unknown)))}"
        )

    if len(fills) > 1:
        raise UnsupportedRendererError(
            f'expected at most one enabled CIMSolidFill, found {len(fills)}'
        )
    if len(strokes) != 1:
        raise UnsupportedRendererError(
            f'expected exactly one enabled CIMSolidStroke, found {len(strokes)}'
        )
    return (fills[0] if fills else None), strokes[0]


def _stroke(symbol: dict) -> dict:
    """Return the one enabled CIMSolidStroke in a CIMSymbolReference."""
    return _symbol_parts(symbol)[1]


def _class_value(unique_value_class: dict) -> str:
    """Return the single field value a class matches.

    Returned exactly as the .lyrx stores it, trailing whitespace and all. In the
    consultation areas style one class is `'Bridge River '`, which looks like a
    typo and is not: the warehouse value carries that space too, so trimming the
    key here would stop it matching and drop that territory to the default
    symbol. A shapefile export of the same data cannot show this, because DBF
    pads every text field to its full width and a real trailing space is
    indistinguishable from the padding.
    """
    values = unique_value_class.get('values') or []
    if len(values) != 1:
        raise UnsupportedRendererError(
            f'expected one CIMUniqueValue per class, found {len(values)}'
        )

    field_values = values[0].get('fieldValues') or []
    if len(field_values) != 1:
        raise UnsupportedRendererError(
            'multi-field unique values are not translated'
        )
    return field_values[0]


@dataclass
class _Part:
    """One symbol part - the fills, or the strokes - across every class.

    Parallel to `_Classes.values`: the nth alpha belongs to the nth class value.
    `colours` and `widths` are already flattened into the value/result pairs a
    MapLibre match takes, which is why they are longer.
    """

    colours: list[Any] = dc_field(default_factory=list)
    alphas: list[float] = dc_field(default_factory=list)
    # Only the classes whose width is not DEFAULT_WIDTH_POINTS. Unused by fills,
    # which have no width of their own.
    widths: list[Any] = dc_field(default_factory=list)


@dataclass
class _Classes:
    """What one walk of the renderer's classes collected."""

    values: list[str] = dc_field(default_factory=list)
    stroke: _Part = dc_field(default_factory=_Part)
    fill: _Part = dc_field(default_factory=_Part)
    layout: dict = dc_field(default_factory=dict)
    # How many visible classes carried a fill, to catch a ragged style.
    filled: int = 0


def _read_classes(renderer: dict) -> _Classes:
    """Walk the renderer's classes once, collecting everything the style needs.

    Collects the class values in .lyrx order, the flat value/colour pairs a
    MapLibre match expression takes, the value/width pairs for the classes whose
    stroke is not the common width, the per-class alphas, and the layout the
    first stroke implies.
    """
    read = _Classes()

    for group in renderer.get('groups') or []:
        for unique_value_class in group.get('classes') or []:
            # A class the renderer hides draws nothing, so it should match
            # nothing either.
            if not unique_value_class.get('visible', True):
                continue

            value = _class_value(unique_value_class)
            fill, stroke = _symbol_parts(unique_value_class['symbol'])

            read.values.append(value)
            read.stroke.colours.extend([value, _hex_colour(stroke['color'])])
            read.stroke.alphas.append(_alpha(stroke['color']))

            # Only the exceptions are named; the common width is the match's
            # fallback, which keeps 299 classes to a handful of width entries.
            width_points = stroke.get('width', DEFAULT_WIDTH_POINTS)
            if width_points != DEFAULT_WIDTH_POINTS:
                read.stroke.widths.extend(
                    [value, round(width_points * POINTS_TO_PIXELS, 3)]
                )

            if fill is not None:
                read.filled += 1
                read.fill.colours.extend([value, _hex_colour(fill['color'])])
                read.fill.alphas.append(_alpha(fill['color']))

            # Cap and join are per stroke in the CIM and per layer in MapLibre,
            # so the first class sets them for all of them.
            if not read.layout:
                read.layout = _layout(stroke)

    if read.filled and read.filled != len(read.values):
        # Some classes filled and some not. MapLibre draws one fill layer over
        # the whole source, so the unfilled classes would have to fall back to
        # something, and every choice here is a guess about what the cartographer
        # meant.
        raise UnsupportedRendererError(
            f'{read.filled} of {len(read.values)} visible classes carry a fill; '
            f'a style must fill all of them or none'
        )

    return read


def _uniform(values: list, default):
    """Return the one value a list holds, or None if it holds more than one."""
    unique = set(values)
    if not unique:
        return default
    return unique.pop() if len(unique) == 1 else None


def _opacity_property(alphas: list, class_values: list, field: str, layer_opacity):
    """Turn per-class alphas and the layer's own transparency into one opacity.

    ArcGIS applies a symbol's alpha and the layer's transparency one after the
    other, so they multiply. Where every class shares an alpha - which is the
    usual case - this collapses to a single number; where they differ it becomes
    a match on the same field as the colour, because MapLibre has one opacity per
    layer and no other way to say it.

    None where the result is fully opaque, so the property is left off entirely
    rather than written as a redundant 1.
    """
    scale = 1.0 if layer_opacity is None else layer_opacity
    shared = _uniform(alphas, 1.0)

    if shared is not None:
        combined = round(shared * scale, 4)
        return None if combined == 1.0 else combined

    pairs: list[Any] = []
    for value, alpha in zip(class_values, alphas):
        pairs.extend([value, round(alpha * scale, 4)])
    return ['match', ['get', field], *pairs, round(scale, 4)]


def unique_value_paint(layer_definition: dict) -> tuple[dict, dict]:
    """Translate one CIMFeatureLayer into a MapLibre style and a manifest.

    The manifest records what the renderer actually covers, so the ingest can
    say which classes matched no feature and - the one that matters - which
    feature values matched no class and would therefore draw in the default
    symbol.
    """
    renderer = layer_definition.get('renderer') or {}
    if renderer.get('type') != 'CIMUniqueValueRenderer':
        raise UnsupportedRendererError(
            f"expected a CIMUniqueValueRenderer, got {renderer.get('type')}"
        )

    fields = renderer.get('fields') or []
    if len(fields) != 1:
        raise UnsupportedRendererError(
            f'expected exactly one renderer field, found {len(fields)}'
        )

    # ogr2ogr's PostgreSQL driver lowercases every identifier it writes, so the
    # MVT property is `cnsltn_area_name` where the .lyrx says CNSLTN_AREA_NAME.
    # Matching on the .lyrx spelling finds nothing and paints the whole layer in
    # the default symbol, which reads as a styling choice rather than a bug.
    field = fields[0].lower()

    read = _read_classes(renderer)
    if not read.values:
        raise UnsupportedRendererError('the renderer carries no visible classes')

    layer_opacity = _opacity(layer_definition)

    line_paint: dict = {
        'line-color': [
            'match', ['get', field], *read.stroke.colours, _default_colour(renderer),
        ],
    }

    # `referenceScale` is null on this layer and `scaleSymbols` therefore does
    # nothing, so ArcGIS strokes it at one width from the layer's floor all the
    # way in. A zoom interpolation here would look like an improvement and would
    # be a divergence from iMap at every zoom but one.
    default_width = round(DEFAULT_WIDTH_POINTS * POINTS_TO_PIXELS, 3)
    line_paint['line-width'] = (
        ['match', ['get', field], *read.stroke.widths, default_width]
        if read.stroke.widths else default_width
    )

    line_opacity = _opacity_property(
        read.stroke.alphas, read.values, field, layer_opacity
    )
    if line_opacity is not None:
        line_paint['line-opacity'] = line_opacity

    layers = [{
        'id': 'line',
        'type': 'line',
        # The ingest fills this; it names an MVT layer.
        'sourceLayer': None,
        'layout': read.layout,
        'paint': line_paint,
    }]

    # Under the outline, not over it. A translucent fill drawn on top would wash
    # out the boundary it belongs to, and where two areas touch it would tint the
    # neighbour's edge as well.
    if read.filled:
        fill_paint: dict = {
            'fill-color': [
                'match', ['get', field], *read.fill.colours, INVISIBLE,
            ],
        }
        fill_opacity = _opacity_property(
            read.fill.alphas, read.values, field, layer_opacity
        )
        if fill_opacity is not None:
            fill_paint['fill-opacity'] = fill_opacity

        layers.insert(0, {
            'id': 'fill',
            'type': 'fill',
            'sourceLayer': None,
            'layout': {},
            'paint': fill_paint,
        })

    # Drawing a translucent polygon takes a fill layer and a line layer over the
    # same tile, so what a style describes is an ordered set of MapLibre layers
    # rather than one paint bag. An outline-only renderer is the degenerate case
    # of that - a list of one - not a different shape.
    style = {
        'source': {'minZoom': _min_zoom(layer_definition)},
        'layers': layers,
    }
    manifest = {'field': field, 'classes': read.values}
    return style, manifest


def _layout(stroke: dict) -> dict:
    """Cap and join, which the CIM records per stroke and MapLibre per layer.

    Free fidelity: every class in a style shares these in practice, and they are
    visible wherever a boundary turns sharply, which on a territory outline of
    several hundred vertices is everywhere.
    """
    layout = {}
    cap = CAP_STYLES.get(stroke.get('capStyle'))
    join = JOIN_STYLES.get(stroke.get('joinStyle'))
    if cap:
        layout['line-cap'] = cap
    if join:
        layout['line-join'] = join
    return layout


def _default_colour(renderer: dict) -> str:
    """Return the colour a value outside every class draws in.

    ArcGIS draws the default symbol only when both of these say so, and on this
    layer both do - so an unmatched value is a visible black outline rather than
    nothing, and the manifest's unmatched values are worth acting on.
    """
    draws_default = (
        renderer.get('useDefaultSymbol', False) and
        renderer.get('isDefaultSymbolVisible', False)
    )
    if not draws_default:
        return INVISIBLE

    default_symbol = renderer.get('defaultSymbol')
    if not default_symbol:
        return INVISIBLE
    return _hex_colour(_stroke(default_symbol)['color'])


def _opacity(layer_definition: dict) -> Optional[float]:
    """Layer transparency as a MapLibre opacity.

    One `line-opacity` rather than alpha folded into every class colour: the
    composite is identical and this is one place to be wrong instead of 299.
    """
    transparency = layer_definition.get('transparency') or 0
    if not transparency:
        return None
    return round((CIM_ALPHA_MAX - transparency) / CIM_ALPHA_MAX, 4)


def _min_zoom(layer_definition: dict) -> Optional[int]:
    """Return the layer's coarsest drawing scale, as a MapLibre zoom.

    ArcGIS hides a layer *above* `minScale` - the smaller-scale, zoomed-out side
    - which is the floor MapLibre calls minzoom. `maxScale` is the other end and
    is absent here, so the layer draws from this zoom all the way in.
    """
    min_scale = layer_definition.get('minScale')
    if not min_scale:
        return None
    return zoom_for_scale_denominator(float(min_scale))
