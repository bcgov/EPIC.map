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
"""Tests for the object-store side of the hosted-layer ingest.

No boto3 call happens here, and none should. What is worth asserting is the part
that decides where to go, what to call what arrives, and what to say when the
store says no - and all of that is pure. The download itself is exercised against
a real store by hand, because a mock of download_file only ever proves that the
mock was called.
"""

from dataclasses import dataclass
from typing import Optional

import pytest

from map_api.config import s3_endpoint
from map_api.services.local_layer_service.ingest import CannotRunError
from map_api.services.local_layer_service.s3 import (
    DENIED_CODES, NOT_FOUND_CODES, ObjectStoreError, client, describe_client_error, local_name, missing_settings)


@dataclass
class StubConfig:
    """Stands in for a config object, so nothing has to reload the real one.

    The real settings are class attributes evaluated at import, so a test cannot
    set an environment variable and watch one change without reloading the
    module. missing_settings only reads attributes, so it does not need to.
    """

    S3_BUCKET: str = 'a-bucket'
    S3_ENDPOINT_URL: str = 'https://objectstore.example.gov.bc.ca'
    S3_ACCESS_KEY_ID: str = 'an-access-key'
    S3_SECRET_ACCESS_KEY: str = 'a-secret'
    S3_REGION: Optional[str] = 'us-east-1'


class TestEndpoint:
    """s3_endpoint turns what the storage team hands out into what botocore needs."""

    @pytest.mark.parametrize('host, expected', [
        ('objectstore.example.gov.bc.ca', 'https://objectstore.example.gov.bc.ca'),
        # A scheme already there is respected, which is how a local minio is
        # reached over http.
        ('http://localhost:9000', 'http://localhost:9000'),
        ('https://objectstore.example.gov.bc.ca', 'https://objectstore.example.gov.bc.ca'),
        # A trailing slash would make every signed URL contain '//'.
        ('objectstore.example.gov.bc.ca/', 'https://objectstore.example.gov.bc.ca'),
        ('  objectstore.example.gov.bc.ca  ', 'https://objectstore.example.gov.bc.ca'),
    ])
    def test_derives_the_url(self, host, expected):
        """A bare host becomes an https URL; anything already a URL is left alone."""
        assert s3_endpoint(host) == expected

    @pytest.mark.parametrize('host', ['', '   ', None])
    def test_nothing_configured_stays_nothing(self, host):
        """Empty stays empty, so missing_settings can see that it is missing.

        Deliberately not defaulted to a plausible AWS endpoint: that would send
        BC Gov credentials to Amazon and return a 403 that reads like a
        permissions problem rather than an unset variable.
        """
        assert s3_endpoint(host) == ''


class TestLocalName:
    """Where a key lands on disk."""

    @pytest.mark.parametrize('key, expected', [
        ('gis_db/PIP_CONSULTATION_AREAS.gpkg', 'PIP_CONSULTATION_AREAS.gpkg'),
        ('PIP_CONSULTATION_AREAS.lyrx', 'PIP_CONSULTATION_AREAS.lyrx'),
        ('a/deeply/nested/key.gpkg', 'key.gpkg'),
    ])
    def test_is_the_last_segment(self, key, expected):
        """The keys of one delivery are distinct by basename, so this is safe."""
        assert local_name(key) == expected

    @pytest.mark.parametrize('key', ['gis_db/', '', None, '   '])
    def test_a_key_naming_no_file_is_refused(self, key):
        """A prefix is not a delivery, and must not become a directory write."""
        with pytest.raises(ObjectStoreError):
            local_name(key)


class TestMissingSettings:
    """What the ingest refuses to start without."""

    def test_a_full_configuration_is_missing_nothing(self):
        """The happy case reports an empty list, not None."""
        assert missing_settings(StubConfig()) == []

    @pytest.mark.parametrize('blank', [
        'S3_BUCKET', 'S3_ENDPOINT_URL', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
    ])
    def test_each_one_is_reported_by_name(self, blank):
        """Named individually, because "not configured" is not an actionable sentence."""
        assert missing_settings(StubConfig(**{blank: ''})) == [blank]

    def test_several_come_back_in_a_stable_order(self):
        """So the message reads the same on every run."""
        config = StubConfig(S3_SECRET_ACCESS_KEY='', S3_BUCKET='')
        assert missing_settings(config) == ['S3_BUCKET', 'S3_SECRET_ACCESS_KEY']

    def test_a_region_is_not_required(self):
        """Config defaults it, because SigV4 needs a string and no one cares which."""
        assert missing_settings(StubConfig(S3_REGION='')) == []


class TestDescribeClientError:
    """The sentence a Job's log carries when the store says no."""

    @pytest.mark.parametrize('code', sorted(NOT_FOUND_CODES))
    def test_a_missing_object_says_which_two_things_to_check(self, code):
        """Not published yet, or the key is wrong - the only two possibilities."""
        message = describe_client_error(code, 'a-bucket', 'gis_db/pip.gpkg')
        assert 'a-bucket/gis_db/pip.gpkg' in message
        assert 'not been published' in message
        assert 'ingest_spec.py' in message

    @pytest.mark.parametrize('code', sorted(DENIED_CODES))
    def test_a_refusal_names_the_credentials_not_the_object(self, code):
        """A 403 from an object store is almost always a rotated key."""
        message = describe_client_error(code, 'a-bucket', 'gis_db/pip.gpkg')
        assert 'credentials' in message
        assert 'a-bucket/gis_db/pip.gpkg' in message

    @pytest.mark.parametrize('code', sorted(NOT_FOUND_CODES | DENIED_CODES) + ['NoSuchBucket'])
    def test_no_message_could_carry_a_secret(self, code):
        """These lines reach a log a wider group can read than can read the key."""
        message = describe_client_error(code, 'a-bucket', 'gis_db/pip.gpkg')
        assert 'a-secret' not in message
        assert 'an-access-key' not in message

    def test_a_missing_bucket_does_not_mention_the_key(self):
        """The key is beside the point when the bucket is the thing that is wrong."""
        assert describe_client_error('NoSuchBucket', 'a-bucket', 'gis_db/pip.gpkg') == (
            'no bucket a-bucket')

    def test_an_unrecognised_code_is_passed_through(self):
        """Better a code somebody can search for than a swallowed error."""
        message = describe_client_error('SlowDown', 'a-bucket', 'gis_db/pip.gpkg')
        assert 'SlowDown' in message
        assert 'a-bucket/gis_db/pip.gpkg' in message


class TestUnusableEndpoint:
    """A malformed S3_HOST must read as a broken ingest, not a bad delivery."""

    def test_a_nonsense_endpoint_is_an_object_store_error(self):
        """Botocore raises a bare ValueError while building the client.

        It does so before any request, so it escapes every try/except around the
        calls themselves. Uncaught it exits 1 - "the extract was refused" - which
        points whoever reads the failed Job at the delivery rather than at the
        variable that is actually wrong.
        """
        with pytest.raises(ObjectStoreError) as raised:
            client(StubConfig(S3_ENDPOINT_URL='https://...'))

        # Names the variable to change, and quotes what it was given.
        assert 'S3_HOST' in str(raised.value)
        assert 'https://...' in str(raised.value)

    def test_it_is_still_a_cannot_run(self):
        """Which is what makes it exit 2 rather than 1."""
        with pytest.raises(CannotRunError):
            client(StubConfig(S3_ENDPOINT_URL='https://...'))

    def test_a_usable_endpoint_builds_a_client(self):
        """The guard must not reject the real thing. No request is made here."""
        assert client(StubConfig()) is not None


def test_an_object_store_failure_is_a_system_failure():
    """Every object-store failure must be a CannotRunError, so that it exits 2.

    The whole point of the distinction: a delivery that could not be fetched was
    never judged, so it was not refused. If this inheritance is ever broken the
    script's `except CannotRunError` stops catching it, and a missing key starts
    exiting 1 - telling whoever reads the Job to go and look at a file that is
    not the problem.
    """
    assert issubclass(ObjectStoreError, CannotRunError)
