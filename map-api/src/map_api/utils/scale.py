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
"""Map scale to map zoom.

Here rather than on a service because two unrelated callers need it: the BCGW
client reading a WMS MaxScaleDenominator, and the ingest reading a .lyrx
`minScale`. They must agree, and a script has no business importing an HTTP
client.
"""

import math

from map_api.utils.constant import WMS_MAX_LAYER_MIN_ZOOM, WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO


def zoom_for_scale_denominator(denominator: float) -> int:
    """Lowest map zoom that draws at least as fine as `denominator`.

    ArcGIS and GeoServer both use the OGC 0.28mm convention, so a .lyrx
    `minScale` converts by the same arithmetic as a WMS MaxScaleDenominator.
    See WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO for the figure.
    """
    zoom = math.ceil(math.log2(WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO / denominator))
    return max(0, min(zoom, WMS_MAX_LAYER_MIN_ZOOM))
