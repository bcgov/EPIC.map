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
"""A project's submitted components, as the project panel lists them."""

from typing import Optional

from sqlalchemy import text

from map_api.models.db import db
from map_api.services.local_layer_service.eao_categories import PROJECT_COMPONENT, VALUE_COMPONENT


def component_type(raw: Optional[str]) -> str:
    """Name the component type the way the style colours it.

    The delivery spells the project side three ways, so only the value side
    is recognised, as eao_categories does.
    """
    if (raw or '').strip().lower().startswith('value'):
        return VALUE_COMPONENT.label
    return PROJECT_COMPONENT.label


class ProjectComponentService:
    """Reads one project's features out of the EAO layer."""

    @staticmethod
    def for_project(track_id: int) -> list:
        """Return every feature of one project, flat, newest submission first.

        An id with no rows is an empty list rather than a 404: most Track
        projects have no geospatial submission yet.
        """
        rows = db.session.execute(
            text("""
                SELECT feature_id, label, component_type, category, subcategory,
                       amendment_number AS number,
                       source_of_spatial AS source,
                       comment,
                       date_received AS date,
                       style_category,
                       coalesce(sensitive, false) AS sensitive,
                       coalesce(gis_adjusted, false) AS adjusted,
                       is_footprint AS footprint
                FROM cache.eao_project_data
                WHERE track_id = :track_id
                ORDER BY date_received DESC NULLS LAST, label, feature_id
            """),
            {'track_id': track_id},
        ).mappings()

        return [
            {**row, 'component_type': component_type(row['component_type'])}
            for row in rows
        ]
