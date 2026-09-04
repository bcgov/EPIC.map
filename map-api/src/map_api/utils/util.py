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

"""CORS pre-flight decorator.

A simple decorator to add the options method to a Request Class.
"""

import base64
import os
import re
import urllib


def cors_preflight(methods):
    """Render an option method on the class."""

    def wrapper(f):
        def options(self, *args, **kwargs):  # pylint: disable=unused-argument
            return {'Allow': 'GET, DELETE, PUT, POST'}, 200, \
                   {
                       'Access-Control-Allow-Origin': '*',
                       'Access-Control-Allow-Methods': methods,
                       'Access-Control-Allow-Headers': 'Authorization, Content-Type, registries-trace-id, '
                                                       'invitation_token'}

        setattr(f, 'options', options)
        return f

    return wrapper


def parse_csv(value):
    """Split a comma separated configuration value into a list.

    Blank entries and surrounding whitespace are dropped, so a trailing comma or
    a value wrapped across lines in a deployment manifest is not turned into an
    empty allowlist entry - which for an allowlist would be a hole, not a no-op.
    """
    if not value:
        return []
    return [entry.strip() for entry in value.split(',') if entry.strip()]


def allowedorigins():
    """Return the allowed CORS origins from the environment, as a list.

    Prefer `current_app.config['CORS_ORIGINS']`: the configuration classes read
    this once and add per-environment defaults on top. This remains for callers
    that have no application context.
    """
    return parse_csv(os.getenv('CORS_ORIGIN'))


class Singleton(type):
    """Singleton meta."""

    _instances = {}

    def __call__(cls, *args, **kwargs):
        """Call for meta."""
        if cls not in cls._instances:
            cls._instances[cls] = super(Singleton, cls).__call__(*args, **kwargs)
        return cls._instances[cls]


def digitify(payload: str) -> int:
    """Return the digits from the string."""
    return int(re.sub(r'\D', '', payload))


def escape_wam_friendly_url(param):
    """Return encoded/escaped url."""
    base64_org_name = base64.b64encode(bytes(param, encoding='utf-8')).decode('utf-8')
    encode_org_name = urllib.parse.quote(base64_org_name, safe='')
    return encode_org_name
