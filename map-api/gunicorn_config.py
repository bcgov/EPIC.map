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
"""The configuration for gunicorn, which picks up the
   runtime options from environment variables
"""

import os


workers = int(os.environ.get('GUNICORN_PROCESSES', '1'))  # pylint: disable=invalid-name

# One thread per worker means one request at a time for the whole pod: a call
# that waits on an upstream - /catalogue/layers/.../nearest-feature waits on the
# BCGW, and spends ~84% of its time doing so - stalls every other request behind
# it, sign-in included. Threads cost almost nothing while a worker is blocked on
# a socket, and 8 stays well inside SQLAlchemy's 15 connection ceiling.
threads = int(os.environ.get('GUNICORN_THREADS', '8'))  # pylint: disable=invalid-name

forwarded_allow_ips = '*'  # pylint: disable=invalid-name
secure_scheme_headers = {'X-Forwarded-Proto': 'https'}  # pylint: disable=invalid-name
