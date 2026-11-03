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
"""What's here: features of the map's layers under a Select area selection."""

from functools import partial
from typing import Callable, Optional

from flask import current_app

from map_api.models.db import db
from map_api.services.bcgw_service import BcgwService
from map_api.services.local_layer_service import LOCAL_LAYERS, LocalLayerService
from map_api.services.user_layer_service import UserLayerService
from map_api.utils.constant import WHATS_HERE_MAX_FEATURES, WHATS_HERE_MAX_OUTLINE_CHARS, WHATS_HERE_SIMPLIFY_METRES


TOO_DETAILED_MESSAGE = 'The selection is too detailed to search this layer with. Try selecting fewer features.'
NOT_FOUND_MESSAGE = 'This layer was not found.'
SEARCH_FAILED_MESSAGE = 'This layer could not be searched. Please try again.'


class WhatsHereService:
    """Searches warehouse, hosted and imported layers with one selection."""

    @classmethod
    def query(  # pylint: disable=too-many-arguments
        cls, selection: list, catalogue: list, hosted: list, imported: list, user_id: int
    ) -> list:
        """Return each layer's features touching the selected EAO features: warehouse, hosted, then imported."""
        results = []

        if catalogue:
            outline = cls._outline(selection)
            if outline == '':
                results += [cls._found('catalogue', name, [], 0) for name in catalogue]
            elif outline is None:
                results += [cls._failed('catalogue', name, TOO_DETAILED_MESSAGE) for name in catalogue]
            else:
                results += [
                    {'kind': 'catalogue', 'layer': answer.pop('object_name'), **answer}
                    for answer in BcgwService.intersecting_batch(catalogue, outline)
                ]

        results += [
            cls._guarded('hosted', name, partial(cls._hosted, name, selection))
            for name in hosted
        ]
        results += [
            cls._guarded('imported', str(layer_id), partial(cls._imported, layer_id, selection, user_id))
            for layer_id in imported
        ]

        return results

    @classmethod
    def _hosted(cls, object_name: str, selection: list) -> dict:
        features, matched = LocalLayerService.intersecting(
            LOCAL_LAYERS[object_name], selection, WHATS_HERE_MAX_FEATURES
        )
        return cls._found('hosted', object_name, features, matched)

    @classmethod
    def _imported(cls, layer_id, selection: list, user_id: int) -> dict:
        layer = UserLayerService.get_layer(layer_id, user_id)
        if layer is None:
            return cls._failed('imported', str(layer_id), NOT_FOUND_MESSAGE)
        ids, matched = UserLayerService.intersecting(layer.id, selection, WHATS_HERE_MAX_FEATURES)
        features = [{'id': feature_id, 'name': None, 'properties': []} for feature_id in ids]
        return cls._found('imported', str(layer_id), features, matched)

    @classmethod
    def _guarded(cls, kind: str, layer: str, search: Callable[[], dict]) -> dict:
        """Run one PostGIS search in a savepoint, so a failure is that layer's error alone."""
        try:
            with db.session.begin_nested():
                return search()
        except Exception:  # noqa: B902 # pylint: disable=broad-except
            current_app.logger.exception('Searching %s failed unexpectedly.', layer)
            return cls._failed(kind, layer, SEARCH_FAILED_MESSAGE)

    @staticmethod
    def _outline(selection: list) -> Optional[str]:
        """Return the selection as WKT short enough to send; '' when none exists, None when too detailed."""
        for tolerance in WHATS_HERE_SIMPLIFY_METRES:
            outline = LocalLayerService.selection_outline(selection, tolerance)
            if outline is None:
                return ''
            if len(outline) <= WHATS_HERE_MAX_OUTLINE_CHARS:
                return outline
        return None

    @staticmethod
    def _found(kind: str, layer: str, features: list, matched: int) -> dict:
        return {
            'kind': kind,
            'layer': layer,
            'status': 'found' if features else 'empty',
            'features': features,
            'matched': matched,
            'error': None,
        }

    @staticmethod
    def _failed(kind: str, layer: str, message: str) -> dict:
        return {
            'kind': kind,
            'layer': layer,
            'status': 'error',
            'features': [],
            'matched': 0,
            'error': message,
        }
