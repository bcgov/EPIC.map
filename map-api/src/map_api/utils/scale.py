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

Lives here rather than on a service because two unrelated callers need it: the
BCGW client, converting a MaxScaleDenominator off a published WMS style, and the
layer ingest, converting an ArcGIS `minScale` out of a .lyrx. The second is a
script with no business importing an HTTP client, and both must agree - a layer
that appears at a different zoom depending on where its limit was read would be
the kind of difference nobody notices until it is in front of a user.
"""

import math

from map_api.utils.constant import WMS_MAX_LAYER_MIN_ZOOM, WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO


def zoom_for_scale_denominator(denominator: float) -> int:
    """Lowest map zoom that draws at least as fine as `denominator`.

    See WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO for why that figure is the one to
    divide, and why neither the latitude nor the 256 pixel scale set belongs in
    here.

    ArcGIS and GeoServer both express a scale limit under the same OGC 0.28mm
    convention, so a .lyrx `minScale` converts by the same arithmetic as a WMS
    MaxScaleDenominator despite arriving from a different renderer.
    """
    zoom = math.ceil(math.log2(WMS_SCALE_DENOMINATOR_AT_MAP_ZOOM_ZERO / denominator))
    return max(0, min(zoom, WMS_MAX_LAYER_MIN_ZOOM))
