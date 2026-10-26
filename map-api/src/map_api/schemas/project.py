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
"""EPIC.Track project schemas."""

from marshmallow import Schema, fields


class ProjectPointSchema(Schema):
    """What the map draws a project's dot from: a GeoJSON feature's properties."""

    id = fields.Int(metadata={'description': 'EPIC.Track project id'})
    name = fields.Str()
    type_id = fields.Int(
        allow_none=True, data_key='typeId', metadata={'description': 'EPIC.Track project type id'}
    )
    type_name = fields.Str(
        allow_none=True, data_key='typeName', metadata={'description': 'EPIC.Track project type'}
    )
    has_works_in_progress = fields.Bool(
        data_key='hasWorksInProgress',
        metadata={'description': 'Whether any active work on the project is in progress'},
    )
    region_id = fields.Int(
        allow_none=True, data_key='regionId', metadata={'description': 'ENV region id'}
    )
    certificate_issued = fields.Bool(
        data_key='certificateIssued',
        metadata={'description': 'Whether the project holds an EA certificate'},
    )


class ProjectSchema(ProjectPointSchema):
    """What the project card shows."""

    description = fields.Str(allow_none=True)
    proponent_name = fields.Str(allow_none=True, data_key='proponentName')
    region_name = fields.Str(
        allow_none=True, data_key='regionName', metadata={'description': 'ENV region'}
    )
    ea_certificate = fields.Str(allow_none=True, data_key='eaCertificate')
    certificate_status = fields.Str(
        allow_none=True,
        data_key='certificateStatus',
        metadata={
            'description': "The certificate field's value when it holds a status, not a number"
        },
    )
    longitude = fields.Float()
    latitude = fields.Float()
    epic_url = fields.Str(
        allow_none=True,
        data_key='epicUrl',
        metadata={'description': "The project's page on the EPIC public site"},
    )


class FilterOptionSchema(Schema):
    """One row of a code table, as a filter menu lists it."""

    id = fields.Int()
    name = fields.Str()


class ProjectFilterOptionsSchema(Schema):
    """The code tables behind the map's Type and Region menus."""

    types = fields.List(fields.Nested(FilterOptionSchema))
    regions = fields.List(
        fields.Nested(FilterOptionSchema), metadata={'description': 'ENV regions'}
    )


class ProjectWorkSchema(Schema):
    """One work on a project's card."""

    id = fields.Int()
    title = fields.Str(allow_none=True, metadata={'description': 'Work type and simple title'})
    state = fields.Str(
        allow_none=True,
        metadata={'description': 'EPIC.Track work state, e.g. IN_PROGRESS or COMPLETED'},
    )
    phase_name = fields.Str(allow_none=True, data_key='phaseName')
    decision = fields.Str(
        allow_none=True,
        metadata={'description': 'Latest decision milestone outcome, e.g: Amendment Granted'},
    )
    decision_date = fields.Str(allow_none=True, data_key='decisionDate')
    description = fields.Str(allow_none=True)


def to_feature_collection(projects: list) -> dict:
    """Build the GeoJSON the map adds as a source."""
    point_schema = ProjectPointSchema()
    return {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'id': project['id'],
                'geometry': {
                    'type': 'Point',
                    'coordinates': [project['longitude'], project['latitude']],
                },
                'properties': point_schema.dump(project),
            }
            for project in projects
        ],
    }
