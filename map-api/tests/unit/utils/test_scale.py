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
"""Tests for the scale to zoom conversion.

Two callers share this - the BCGW client and the layer ingest - and the failure
it guards against is quiet: get the constant wrong and the figures still look
plausible, landing on the right zoom for about three layers in five.
"""

from map_api.utils.constant import WMS_MAX_LAYER_MIN_ZOOM
from map_api.utils.scale import zoom_for_scale_denominator


def test_matches_the_openmaps_calibration():
    """ADM_NR_DISTRICTS_SPG publishes 1:35,000,000 and draws from map zoom 3.

    This is the check that was made against the live warehouse rather than
    reasoned about, so it is the one that says the constant is right.
    """
    assert zoom_for_scale_denominator(35_000_000) == 3


def test_converts_an_arcgis_min_scale():
    """The consultation areas .lyrx hides itself above 1:6,000,000."""
    assert zoom_for_scale_denominator(6_000_000) == 6


def test_a_finer_limit_is_a_higher_zoom():
    """Monotonic, which is the whole point of the conversion."""
    assert (
        zoom_for_scale_denominator(50_000_000) <
        zoom_for_scale_denominator(5_000_000) <
        zoom_for_scale_denominator(500_000)
    )


def test_a_coarse_limit_never_goes_below_zero():
    """A layer drawn at every zoom has a floor of zero, not a negative one."""
    assert zoom_for_scale_denominator(10_000_000_000) == 0


def test_a_fine_limit_is_capped_where_maplibre_stops():
    """A limit past what MapLibre accepts is capped, which is the honest answer."""
    assert zoom_for_scale_denominator(0.001) == WMS_MAX_LAYER_MIN_ZOOM
