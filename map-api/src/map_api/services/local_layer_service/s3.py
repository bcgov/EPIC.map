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
"""Fetching a layer's delivery out of object storage.

Brings the extract and its .lyrx down to local files and stops. Everything
after is the same code that runs for files handed over by hand, so the
scheduled path and the rehearsed one differ only in where the bytes came from.

Downloaded rather than read through /vsis3/: the sha256 and the .lyrx
translation read every byte anyway, so streaming would only cost the ability to
run the identical load against a file on a desk.

Every failure here is a CannotRunError - a missing key, a refused credential,
an unreachable endpoint are all "the ingest is broken", never "the extract is
bad". Nothing was staged, so the stored layer is untouched.
"""

import time
from dataclasses import dataclass
from pathlib import Path
from typing import List

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from map_api.config import get_ingest_config

from .ingest import CannotRunError


# Long enough for 74MB on a slow morning, short enough that a hung socket does
# not sit until the Job's deadline an hour later.
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 120
MAX_ATTEMPTS = 3

# The configuration without which there is no point trying.
REQUIRED_SETTINGS = (
    'S3_BUCKET', 'S3_ENDPOINT_URL', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
)

# Grouped by what a person would do about them. Several spellings each,
# because the stores do not agree.
NOT_FOUND_CODES = frozenset({'404', 'NoSuchKey', 'NoSuchObject'})
NO_BUCKET_CODES = frozenset({'NoSuchBucket'})
DENIED_CODES = frozenset({
    '403', 'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch',
    'InvalidSecurity', 'ExpiredToken',
})


class ObjectStoreError(CannotRunError):
    """The delivery could not be fetched."""


@dataclass(frozen=True)
class Delivery:
    """What was fetched, as the local paths the rest of the ingest understands."""

    sources: List[Path]
    lyrx: Path


def local_name(key: str) -> str:
    """Return the filename a key lands under: its last segment.

    _check_s3 asserts distinct basenames at import, so flattening a delivery
    into one directory cannot lose a file.
    """
    name = (key or '').rstrip().rsplit('/', 1)[-1]
    if not name:
        raise ObjectStoreError(f'{key!r} names no file')
    return name


def missing_settings(config) -> List[str]:
    """Which of the settings this needs are blank, in a stable order."""
    return [name for name in REQUIRED_SETTINGS if not getattr(config, name, '')]


def describe_client_error(code: str, bucket: str, key: str) -> str:
    """One sentence about a store's error code, in an operator's terms.

    A 403 is almost always a rotated key rather than this object's permissions.
    The secret is never in the sentence: these lines reach a Job log readable
    by more people than the secret is.
    """
    where = f'{bucket}/{key}'
    if code in NOT_FOUND_CODES:
        return (f'no object {where}: the delivery has not been published yet, or the '
                f'key in ingest_spec.py is wrong')
    if code in NO_BUCKET_CODES:
        return f'no bucket {bucket}'
    if code in DENIED_CODES:
        return f'the object store refused these credentials for {where}'
    return f'the object store returned {code} for {where}'


def client(config=None):
    """Build an S3 client for the configured store. No I/O here."""
    conf = config or get_ingest_config()

    try:
        return boto3.client(
            's3',
            endpoint_url=conf.S3_ENDPOINT_URL,
            aws_access_key_id=conf.S3_ACCESS_KEY_ID,
            aws_secret_access_key=conf.S3_SECRET_ACCESS_KEY,
            region_name=conf.S3_REGION,
            config=BotoConfig(
                # Path style: these stores are not certified for
                # <bucket>.<host>, and a dot in a bucket name breaks TLS.
                s3={'addressing_style': 'path'},
                connect_timeout=CONNECT_TIMEOUT,
                read_timeout=READ_TIMEOUT,
                retries={'mode': 'standard', 'max_attempts': MAX_ATTEMPTS},
            ),
        )
    except ValueError as error:
        # botocore validates the endpoint while building the client and raises
        # a bare ValueError, which would exit 1 and send the reader to the
        # delivery instead of S3_HOST. A secret once held the literal '...'.
        raise ObjectStoreError(
            f'S3_HOST does not give a usable endpoint ({conf.S3_ENDPOINT_URL!r}): {error}'
        ) from error


def _download(s3, bucket: str, key: str, destination: Path):
    """Fetch one object, and be sure all of it arrived.

    Size against what the store promised, which catches a transfer stopped
    early - a full disk, a killed pod - leaving a valid but truncated
    GeoPackage. Not the ETag: a multipart upload's is '<hash>-<parts>', so it
    would fail on exactly the large objects it would protect.
    """
    try:
        head = s3.head_object(Bucket=bucket, Key=key)
        expected = head['ContentLength']
    except ClientError as error:
        code = str(error.response.get('Error', {}).get('Code', 'an unknown error'))
        raise ObjectStoreError(describe_client_error(code, bucket, key)) from error
    except BotoCoreError as error:
        raise ObjectStoreError(f'could not reach the object store for {bucket}/{key}: {error}') from error

    started = time.monotonic()
    try:
        s3.download_file(bucket, key, str(destination))
    except ClientError as error:
        code = str(error.response.get('Error', {}).get('Code', 'an unknown error'))
        raise ObjectStoreError(describe_client_error(code, bucket, key)) from error
    except BotoCoreError as error:
        raise ObjectStoreError(f'could not download {bucket}/{key}: {error}') from error
    except OSError as error:
        raise ObjectStoreError(f'could not write {destination}: {error}') from error

    written = destination.stat().st_size
    if written != expected:
        raise ObjectStoreError(
            f'{bucket}/{key}: downloaded {written:,} bytes of {expected:,}'
        )

    elapsed = time.monotonic() - started
    print(f'  {key} ({written:,} bytes, {elapsed:.1f}s)')


def fetch(spec, into: Path, config=None) -> Delivery:
    """Download this layer's delivery into an existing directory."""
    conf = config or get_ingest_config()

    absent = missing_settings(conf)
    if absent:
        # Refused, not defaulted: with no endpoint boto3 signs for real AWS
        # and sends BC Gov credentials there, and the 403 reads like a
        # permissions problem rather than a missing variable.
        raise ObjectStoreError(f'object storage is not configured: {", ".join(absent)} not set')

    if spec.s3 is None:
        raise ObjectStoreError(
            f'{spec.object_name} has no S3 source in ingest_spec.py; '
            f'load it with --source instead'
        )

    bucket = conf.S3_BUCKET
    s3 = client(conf)

    print(f'Fetching from {conf.S3_ENDPOINT_URL}/{bucket} ...')
    sources = []
    for key in spec.s3.sources:
        destination = into / local_name(key)
        _download(s3, bucket, key, destination)
        sources.append(destination)

    lyrx = into / local_name(spec.s3.lyrx)
    _download(s3, bucket, spec.s3.lyrx, lyrx)

    return Delivery(sources=sources, lyrx=lyrx)
