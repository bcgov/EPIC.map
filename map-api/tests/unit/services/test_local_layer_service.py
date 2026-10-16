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
"""Tests for the hosted layer service, against real rows.

The endpoint tests stub this service out, so the SQL it writes is only ever run
here. One row is enough: what is being asserted is the shape of the answer, not
anything about the extract.
"""
import json

from sqlalchemy import text

from map_api.models.db import db
from map_api.services.local_layer_service import LOCAL_LAYERS, LocalLayerService


OBJECT_NAME = 'WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP'
FEATURE_GUID = '44AD0BF7899D42CDBFC9597FA963A1CE'

# A degree square off the south coast, which is where the numbers below come
# from. Stored in 3857, as the tiles need it.
A_SQUARE = (
    'MULTIPOLYGON(((-123 49, -123 50, -122 50, -122 49, -123 49)))'
)


def insert_area(**overrides):
    """Store one consultation area, with one contact on it."""
    row = {
        'guid': FEATURE_GUID,
        'name': 'Taku River Tlingit First Nation',
        'contact_type': 'Consultation Area Contact',
        'contacts': json.dumps([{
            'organizationName': 'Taku River Tlingit First Nation',
            'organizationType': 'First Nation',
            'phoneNumber': '2506517900',
        }]),
        'wkt': A_SQUARE,
        **overrides,
    }
    db.session.execute(
        text("""
            INSERT INTO cache.pip_consultation_areas (
                cnsltn_area_guid, cnsltn_area_name, cnsltn_area_mapsource,
                contact_type, contact_count, contacts, geom
            ) VALUES (
                :guid, :name, 'Mapped by EAO', :contact_type, 1,
                CAST(:contacts AS jsonb),
                ST_Transform(ST_GeomFromText(:wkt, 4326), 3857)
            )
        """),
        row,
    )
    db.session.commit()


def test_feature_returns_the_stored_record(app, session):
    """The tile carries a key; this is what the key is for."""
    insert_area()

    feature = LocalLayerService.feature(LOCAL_LAYERS[OBJECT_NAME], FEATURE_GUID)

    assert feature['cnsltn_area_name'] == 'Taku River Tlingit First Nation'
    assert feature['contacts'][0]['phoneNumber'] == '2506517900'
    assert feature['contact_count'] == 1


def test_feature_carries_bounds_in_degrees(app, session):
    """What the client points the camera with, which no tile could tell it."""
    insert_area()

    bounds = LocalLayerService.feature(
        LOCAL_LAYERS[OBJECT_NAME], FEATURE_GUID
    )['bounds']

    west, south, east, north = bounds
    assert (round(west), round(south), round(east), round(north)) == (
        -123, 49, -122, 50,
    )


def record_load(status: str, loaded_date: str, object_name: str = OBJECT_NAME):
    """Write one row of the ingest's load history."""
    db.session.execute(
        text("""
            INSERT INTO cache.local_layer_loads
                (object_name, status, source_name, loaded_date)
            VALUES (:object_name, :status, 'PIP_CONSULTATION_AREAS.gpkg',
                    CAST(:loaded_date AS timestamp))
        """),
        {'object_name': object_name, 'status': status, 'loaded_date': loaded_date},
    )
    db.session.commit()


def test_last_loaded_is_the_most_recent_load(app, session):
    """What dates the layer is when its rows were last replaced."""
    record_load('loaded', '2026-09-01 09:00:00')
    record_load('loaded', '2026-10-05 09:00:00')

    loaded = LocalLayerService.last_loaded(LOCAL_LAYERS[OBJECT_NAME], OBJECT_NAME)

    assert loaded.date().isoformat() == '2026-10-05'


def test_last_loaded_ignores_a_run_that_changed_nothing(app, session):
    """A delivery that was unchanged or refused left the data where it was."""
    record_load('loaded', '2026-10-05 09:00:00')
    record_load('skipped', '2026-10-12 09:00:00')
    record_load('refused', '2026-10-13 09:00:00')

    loaded = LocalLayerService.last_loaded(LOCAL_LAYERS[OBJECT_NAME], OBJECT_NAME)

    assert loaded.date().isoformat() == '2026-10-05'


def test_last_loaded_ignores_another_layer_s_history(app, session):
    """Each layer is dated by its own loads."""
    record_load('loaded', '2026-10-05 09:00:00', object_name='WHSE_TEST.OTHER')

    assert LocalLayerService.last_loaded(
        LOCAL_LAYERS[OBJECT_NAME], OBJECT_NAME
    ) is None


def test_last_loaded_falls_back_to_the_rows_themselves(app, session):
    """Rows put there by hand still have a date; the history is what is missing."""
    insert_area()

    loaded = LocalLayerService.last_loaded(LOCAL_LAYERS[OBJECT_NAME], OBJECT_NAME)

    assert loaded is not None


def test_last_loaded_is_none_for_a_layer_with_nothing_in_it(app, session):
    """Nothing loaded is no date, not today's."""
    assert LocalLayerService.last_loaded(
        LOCAL_LAYERS[OBJECT_NAME], OBJECT_NAME
    ) is None


def test_an_unknown_feature_is_none(app, session):
    """A key matching nothing is nothing, not an empty record."""
    assert LocalLayerService.feature(
        LOCAL_LAYERS[OBJECT_NAME], 'A' * 32
    ) is None
