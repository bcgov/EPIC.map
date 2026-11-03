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
"""What's here schemas."""

from marshmallow import EXCLUDE, Schema, fields, validate

from map_api.schemas.catalogue_layer import FeatureAttributeSchema
from map_api.services.local_layer_service import EAO_OBJECT_NAME, LOCAL_LAYERS
from map_api.utils.constant import METADATA_MAX_LAYERS, OBJECT_NAME_PATTERN, WHATS_HERE_MAX_SELECTION


# Hosted layers other than the selection's own.
SEARCHABLE_HOSTED_LAYERS = [name for name in LOCAL_LAYERS if name != EAO_OBJECT_NAME]


class WhatsHereSchema(Schema):
    """The selection, and the layers on the map to search with it."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    selection = fields.List(
        fields.Str(validate=validate.Length(min=1, max=100)),
        required=True,
        validate=validate.Length(min=1, max=WHATS_HERE_MAX_SELECTION),
        metadata={'description': 'EAO feature ids of the selected footprints and components'},
    )
    catalogue = fields.List(
        fields.Str(validate=validate.Regexp(OBJECT_NAME_PATTERN)),
        load_default=list,
        validate=validate.Length(max=METADATA_MAX_LAYERS),
        metadata={'description': 'Warehouse objects to search'},
    )
    hosted = fields.List(
        fields.Str(validate=validate.OneOf(SEARCHABLE_HOSTED_LAYERS)),
        load_default=list,
        validate=validate.Length(max=len(SEARCHABLE_HOSTED_LAYERS)),
        metadata={'description': 'Hosted layers to search, by object name'},
    )
    imported = fields.List(
        fields.UUID(),
        load_default=list,
        validate=validate.Length(max=METADATA_MAX_LAYERS),
        metadata={'description': "The user's own imported layers to search"},
    )


class WhatsHereFeatureSchema(Schema):
    """One feature a layer has under the selection."""

    id = fields.Str(
        allow_none=True,
        metadata={'description': "The layer's id for it; null where it has none stable enough to draw by"},
    )
    name = fields.Str(
        allow_none=True,
        metadata={'description': 'What the layer names it; null where nothing does'},
    )
    properties = fields.List(
        fields.Nested(FeatureAttributeSchema),
        metadata={'description': 'Warehouse attributes; empty for layers whose records are read elsewhere'},
    )


class WhatsHereLayerSchema(Schema):
    """What one layer has under the selection."""

    kind = fields.Str(validate=validate.OneOf(['catalogue', 'hosted', 'imported']))
    layer = fields.Str(metadata={'description': 'Object name, or imported layer id'})
    status = fields.Str(validate=validate.OneOf(['found', 'empty', 'error']))
    features = fields.List(fields.Nested(WhatsHereFeatureSchema))
    matched = fields.Int(metadata={'description': 'How many matched, which may be more than are listed'})
    error = fields.Str(
        allow_none=True,
        metadata={'description': 'Why this layer could not answer; null when it did'},
    )


class WhatsHereResultSchema(Schema):
    """Every layer asked, warehouse then hosted then imported."""

    results = fields.List(fields.Nested(WhatsHereLayerSchema))


class FeatureBoundsSchema(Schema):
    """Where one warehouse feature is."""

    bounds = fields.List(
        fields.Float(),
        allow_none=True,
        metadata={'description': 'west, south, east, north; null when too heavy to measure'},
    )
