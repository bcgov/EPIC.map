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
"""The category rule run as SQL, over the spellings the delivery actually uses.

The precedence used to be tested through a Python mirror of the rule that the
ingest never ran, which gave the same answers without proving anything about
the CASE in transform.sql. These run the generated expression in Postgres, so
what is asserted is what a load writes.
"""

import pytest

from map_api.models.db import db
from map_api.services.local_layer_service.eao_categories import (
    AMENDMENT, FOOTPRINT, PROJECT_COMPONENT, VALUE_COMPONENT, amendment_sql, category_case_sql)


@pytest.fixture()
def staged(app, session):  # pylint: disable=unused-argument
    """Make a table shaped like the staging one, to run the rule's SQL over."""
    cursor = db.session.connection().connection.cursor()
    cursor.execute("""
        CREATE TEMP TABLE category_rows (
            id serial PRIMARY KEY, source_layer text,
            component_type text, subcategory text, footprint text);
    """)
    yield cursor
    cursor.close()


def _category(cursor, component, subcategory, footprint, source_layer='poly'):
    """Classify one row exactly as the transform does."""
    cursor.execute(
        'DELETE FROM category_rows; '
        'INSERT INTO category_rows (source_layer, component_type, subcategory,'
        ' footprint) VALUES (%s, %s, %s, %s)',
        (source_layer, component, subcategory, footprint))

    # The footprint branch is dropped for the classes that do not carry the
    # flag, which is how the transform treats lines and points.
    case = (category_case_sql() if source_layer == 'poly'
            else category_case_sql(footprint=None))
    cursor.execute(f'SELECT {case}, {amendment_sql()} FROM category_rows')
    return cursor.fetchone()


@pytest.mark.parametrize('component', [
    'Project component', 'Project Component', 'Project', '', None,
])
def test_a_project_component_is_the_fallback(staged, component):
    """574 of the 862 polygons answer none of the other tests."""
    assert _category(staged, component, 'Pre EA', 'No')[0] == \
        PROJECT_COMPONENT.slug


@pytest.mark.parametrize('component', [
    'Value component', 'value component', ' Value Component ', 'VALUE COMPONENT',
])
def test_a_value_component_is_recognised_whatever_the_casing(staged, component):
    """The delivery is inconsistently cased and padded; the colour is not."""
    assert _category(staged, component, 'Pre EA', 'No')[0] == \
        VALUE_COMPONENT.slug


@pytest.mark.parametrize('footprint', ['Yes', 'yes', ' YES '])
def test_the_footprint_flag_takes_precedence(staged, footprint):
    """The prototype draws footprints from a layer of their own."""
    assert _category(staged, 'Project component', 'Pre EA', footprint)[0] == \
        FOOTPRINT.slug


def test_a_footprint_beats_an_amendment(staged):
    """109 of the 128 amendment polygons are also flagged Footprint."""
    assert _category(staged, 'Project component', 'Amendment', 'Yes')[0] == \
        FOOTPRINT.slug


def test_a_footprint_beats_a_value_component(staged):
    """Precedence, were EAO ever to flag a study area as a footprint."""
    assert _category(staged, 'Value component', 'Pre EA', 'Yes')[0] == \
        FOOTPRINT.slug


def test_an_amendment_beats_a_value_component(staged):
    """The prototype's COMP_COLOR tests SUBCAT before CTYPE. One row in 862."""
    assert _category(staged, 'Value component', 'Amendment', 'No')[0] == \
        AMENDMENT.slug


@pytest.mark.parametrize('subcategory', ['Amendment', 'amendment', ' Amendment '])
def test_an_amendment_is_recognised_whatever_the_casing(staged, subcategory):
    """The delivery spells it three ways."""
    assert _category(staged, 'Project component', subcategory, 'No')[0] == \
        AMENDMENT.slug


@pytest.mark.parametrize('subcategory', [
    'Application Development and Review', 'Early engagement', 'Pre EA', '', None,
])
def test_another_subcategory_is_not_an_amendment(staged, subcategory):
    """Amendment is one of twelve subcategory values in the delivery."""
    category, is_amendment = _category(staged, 'Project component', subcategory, 'No')
    assert category == PROJECT_COMPONENT.slug
    assert is_amendment is False


@pytest.mark.parametrize('source_layer', ['line', 'point'])
def test_a_class_without_the_flag_ignores_it(staged, source_layer):
    """Ignore the flag where the class does not carry it.

    The point class has no Footprint column, and the prototype gives line
    features the component colours only.
    """
    assert _category(staged, 'Project component', 'Pre EA', 'Yes',
                     source_layer=source_layer)[0] == PROJECT_COMPONENT.slug


def test_the_amendment_flag_is_carried_alongside_the_category(staged):
    """Amendment is a Track work type, so it is a field as well as a colour."""
    category, is_amendment = _category(
        staged, 'Project component', 'Amendment', 'Yes')

    # Drawn as a footprint, and still known to belong to an amendment.
    assert category == FOOTPRINT.slug
    assert is_amendment is True
