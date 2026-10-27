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
"""Tests for reading a project's components out of the EAO layer, against real rows."""
from datetime import date

import pytest
from sqlalchemy import text

from map_api.models.db import db
from map_api.services.project_component_service import ProjectComponentService, component_type


TRACK_ID = 205


def insert_feature(feature_id: str, **overrides):
    """Store one EAO feature, a project component unless told otherwise."""
    row = {
        'feature_id': feature_id,
        'track_id': TRACK_ID,
        'label': 'Access Route',
        'component_type': 'Project Component',
        'category': 'Project Notification',
        'subcategory': 'Pre EA',
        'date_received': None,
        'sensitive': None,
        'gis_adjusted': None,
        **overrides,
    }
    db.session.execute(
        text("""
            INSERT INTO cache.eao_project_data (
                feature_id, source_layer, style_category, is_amendment,
                is_footprint, track_id, project_name, label, component_type,
                category, subcategory, date_received, sensitive, gis_adjusted,
                geom
            ) VALUES (
                :feature_id, 'point', 'project_component', false, false,
                :track_id, 'Nixon Road Wellsite', :label, :component_type,
                :category, :subcategory, :date_received, :sensitive,
                :gis_adjusted,
                ST_Transform(ST_GeomFromText('POINT(-123 49)', 4326), 3857)
            )
        """),
        row,
    )
    db.session.commit()


@pytest.mark.parametrize('raw, expected', [
    ('Project component', 'Project component'),
    ('Project Component', 'Project component'),
    ('Project', 'Project component'),
    (None, 'Project component'),
    (' Value Component ', 'Value component'),
])
def test_component_type_reads_the_delivery_s_spellings(raw, expected):
    """The panel's two sections, whichever way the delivery spelled them."""
    assert component_type(raw) == expected


def test_returns_only_the_project_s_features(app, session):
    """The card is one project's; another's rows are not its business."""
    insert_feature('{A1}')
    insert_feature('{B1}', track_id=368)

    components = ProjectComponentService.for_project(TRACK_ID)

    assert [component['feature_id'] for component in components] == ['{A1}']


def test_an_unflagged_feature_is_not_sensitive_or_adjusted(app, session):
    """A blank flag is no flag, so the panel never has to read a null."""
    insert_feature('{A1}')

    [component] = ProjectComponentService.for_project(TRACK_ID)

    assert component['sensitive'] is False
    assert component['adjusted'] is False
    assert component['footprint'] is False
    assert component['component_type'] == 'Project component'


def test_newest_submission_comes_first(app, session):
    """Undated rows last, where a date cannot place them."""
    insert_feature('{A1}', date_received=None)
    insert_feature('{A2}', date_received=date(2024, 1, 5))
    insert_feature('{A3}', date_received=date(2026, 8, 25))

    components = ProjectComponentService.for_project(TRACK_ID)

    assert [component['feature_id'] for component in components] == ['{A3}', '{A2}', '{A1}']
    assert components[0]['date'] == date(2026, 8, 25)


def test_a_project_with_no_submission_is_empty(app, session):
    """Most projects have none, which is not an error."""
    assert ProjectComponentService.for_project(TRACK_ID) == []
