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
"""What colour a feature of the EAO project data draws in (MAP-46).

Generated here so the SQL that writes the category and the style that matches
on it cannot drift apart.

Matches the prototype's `js/eao-components.js`, which is where this symbology
was agreed. Footprints are a filtered layer of their own rather than a branch
in one ramp, which is what keeps the categories from colliding: 109 of the 128
amendment polygons are also flagged Footprint, and the prototype draws those
blue by excluding footprints from the component layer.

Unlike the PIP layer, no .lyrx is translated: EAO delivers geometry and we own
the symbology.

The prototype's visibility model is not here yet - it shows footprints only
until a project is opened, which is panel state and belongs client-side.
"""

from typing import NamedTuple, Optional, Tuple

# Line features and points take one width across the categories, so these are
# not per-category. Points carry a white ring to stay visible on any basemap.
LINE_WIDTH = 2.2
POINT_RADIUS = 5.0
POINT_HALO_COLOUR = '#FFFFFF'
POINT_HALO_WIDTH = 1.5


class Category(NamedTuple):
    """One styled category, and the Okabe-Ito colours it draws in."""

    # Stored on the row, carried in the tile, matched by the style.
    slug: str
    label: str
    fill: str
    fill_opacity: float
    stroke: str
    # Polygon outline, in screen pixels.
    stroke_width: float


# Okabe-Ito, set by Maria and not to be substituted. Fill and stroke are the
# same hue; only the fill is translucent.
FOOTPRINT = Category(
    slug='footprint',
    label='Footprint',
    fill='#0072B2',
    fill_opacity=0.30,
    stroke='#0072B2',
    stroke_width=1.6,
)

AMENDMENT = Category(
    slug='amendment',
    label='Amendment',
    fill='#CC79A7',
    fill_opacity=0.35,
    stroke='#CC79A7',
    stroke_width=1.4,
)

VALUE_COMPONENT = Category(
    slug='value_component',
    label='Value component',
    fill='#009E73',
    fill_opacity=0.35,
    stroke='#009E73',
    stroke_width=1.4,
)

PROJECT_COMPONENT = Category(
    slug='project_component',
    label='Project component',
    fill='#E69F00',
    fill_opacity=0.35,
    stroke='#E69F00',
    stroke_width=1.4,
)

# In precedence order, most specific first; the last is the fallback.
CATEGORIES: Tuple[Category, ...] = (
    FOOTPRINT, AMENDMENT, VALUE_COMPONENT, PROJECT_COMPONENT,
)

# The three a component may be, once footprints are filtered out. Separate
# because the component layer matches on these and never on footprint.
COMPONENT_CATEGORIES: Tuple[Category, ...] = (
    AMENDMENT, VALUE_COMPONENT, PROJECT_COMPONENT,
)

# The staging table's own names. The three source selects alias the delivery's
# differing spellings onto these, so one rule reads all three feature classes.
FOOTPRINT_COLUMN = 'footprint'
COMPONENT_COLUMN = 'component_type'
SUBCATEGORY_COLUMN = 'subcategory'
# The column the style matches on, written by the transform.
CATEGORY_COLUMN = 'style_category'


def _cleaned(column: str) -> str:
    """Compare case- and whitespace-insensitively, which the delivery needs."""
    return f"lower(btrim(coalesce({column}, '')))"


def category_case_sql(component: str = COMPONENT_COLUMN,
                      subcategory: str = SUBCATEGORY_COLUMN,
                      footprint: Optional[str] = FOOTPRINT_COLUMN) -> str:
    """Return the CASE deriving a row's category, for the transform.

    Pasted into transform.sql so the file reads and runs on its own;
    test_eao_sql.py fails if the two drift apart.

    `footprint` is None for a source layer the flag does not apply to, which
    collapses that branch rather than naming a column ogr2ogr did not stage.
    """
    pad = ' ' * 20
    branches = []
    if footprint is not None:
        branches.append(
            f"{pad}WHEN {_cleaned(footprint)} = 'yes' THEN '{FOOTPRINT.slug}'"
        )
    branches.append(
        f"{pad}WHEN {_cleaned(subcategory)} = 'amendment' "
        f"THEN '{AMENDMENT.slug}'"
    )
    # LIKE 'value%' rather than equality: the delivery spells the project side
    # three ways ('Project component', 'Project Component', 'Project'), and
    # only the value side needs recognising.
    branches.append(
        f"{pad}WHEN {_cleaned(component)} LIKE 'value%' "
        f"THEN '{VALUE_COMPONENT.slug}'"
    )
    branches.append(f"{pad}ELSE '{PROJECT_COMPONENT.slug}'")
    closing = ' ' * 16 + 'END'
    return 'CASE\n' + '\n'.join(branches) + '\n' + closing


def amendment_sql(subcategory: str = SUBCATEGORY_COLUMN) -> str:
    """Return the expression deriving a row's amendment flag, for the transform."""
    return f"{_cleaned(subcategory)} = 'amendment'"


def _component_match(attribute: str) -> list:
    """Match a Category attribute over the component categories, last as default."""
    *matched, default = COMPONENT_CATEGORIES
    pairs = []
    for category in matched:
        pairs += [category.slug, getattr(category, attribute)]
    return ['match', ['get', CATEGORY_COLUMN], *pairs, getattr(default, attribute)]


def eao_style() -> dict:
    """Build the MapLibre style for the EAO layers, in the shape /style serves.

    Six specs over one mixed-geometry tile. Footprints are drawn first and
    their own colour; components above them, coloured by category.
    """
    polygon = ['==', ['geometry-type'], 'Polygon']
    is_footprint = ['==', ['get', CATEGORY_COLUMN], FOOTPRINT.slug]
    # Polygons that are not the project boundary, which is the layer the
    # prototype colours by category.
    is_component = ['all', polygon,
                    ['!=', ['get', CATEGORY_COLUMN], FOOTPRINT.slug]]

    def fill(spec_id, filter_, colour, opacity):
        return {
            'id': spec_id,
            'type': 'fill',
            # Named by the ingest, which knows the MVT layer.
            'sourceLayer': None,
            'filter': filter_,
            'layout': {},
            'paint': {'fill-color': colour, 'fill-opacity': opacity},
        }

    def line(spec_id, filter_, colour, width):
        return {
            'id': spec_id,
            'type': 'line',
            'sourceLayer': None,
            'filter': filter_,
            'layout': {'line-cap': 'round', 'line-join': 'round'},
            'paint': {'line-color': colour, 'line-width': width},
        }

    layers = [
        # Footprint under the components, so a component is what gets clicked.
        fill('footprint-fill', is_footprint, FOOTPRINT.fill, FOOTPRINT.fill_opacity),
        line('footprint-outline', is_footprint, FOOTPRINT.stroke,
             FOOTPRINT.stroke_width),
        fill('component-fill', is_component,
             _component_match('fill'),
             _component_match('fill_opacity')),
        line('component-outline', is_component,
             _component_match('stroke'),
             _component_match('stroke_width')),
        # Lines and points take the component colours at one width. The
        # prototype does not give them a footprint branch.
        line('line', ['==', ['geometry-type'], 'LineString'],
             _component_match('stroke'), LINE_WIDTH),
        {
            'id': 'point',
            'type': 'circle',
            'sourceLayer': None,
            'filter': ['==', ['geometry-type'], 'Point'],
            'layout': {},
            'paint': {
                'circle-color': _component_match('fill'),
                'circle-radius': POINT_RADIUS,
                'circle-stroke-color': POINT_HALO_COLOUR,
                'circle-stroke-width': POINT_HALO_WIDTH,
            },
        },
    ]

    return {'source': {'minZoom': None}, 'layers': layers}


def style_manifest() -> dict:
    """Record what the style covers, in the shape the ingest stores it."""
    return {
        'field': CATEGORY_COLUMN,
        'classes': [category.slug for category in CATEGORIES],
    }
