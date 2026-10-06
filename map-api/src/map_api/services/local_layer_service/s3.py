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

EAO publishes the extract and its .lyrx to a BC Gov object store; this brings
them down to local files and stops there. Everything after that - hashing them
to recognise a republish, staging, checking, replacing or refusing - is the same
code that runs when somebody hands the files over by hand, and that is
deliberate: the scheduled path and the rehearsed path differ only in where the
bytes came from.

Downloaded rather than read in place, though GDAL would happily open /vsis3/.
The sha256 that lets most scheduled runs do nothing at all has to read every
byte anyway, and so does the .lyrx translation, so streaming would save nothing
and would cost the ability to run the identical load against a file on a desk.

Nothing here writes to cache.local_layer_loads. This module has no database
connection, and the row recording what happened belongs to the script that owns
the transaction.

Every failure in here is a CannotRunError: a missing key, a refused credential and an
unreachable endpoint are all "the ingest is broken", never "the extract is bad".
They exit 2, and the stored layer is untouched because nothing was staged.
"""

import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from map_api.config import get_ingest_config

from .ingest import CannotRunError


# Long enough for a 74MB object on a slow morning, short enough that a hung
# socket does not sit there until the Job's deadline expires an hour later.
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 120
MAX_ATTEMPTS = 3

# The configuration without which there is no point trying.
REQUIRED_SETTINGS = (
    'S3_BUCKET', 'S3_ENDPOINT_URL', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
)

# Error codes an S3-compatible store returns, grouped by what a person would do
# about them. Several spellings each, because the stores do not agree.
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
    lyrx: Optional[Path] = None

    @property
    def paths(self) -> List[Path]:
        """Everything that was downloaded, for reporting and cleanup."""
        return list(self.sources) + ([self.lyrx] if self.lyrx else [])


def local_name(key: str) -> str:
    """Return the filename a key lands under: its last segment.

    The keys of one delivery are asserted to have distinct basenames at import
    (see ingest_spec._check_s3), so flattening them into one directory cannot
    lose a file.
    """
    name = (key or '').rstrip().rsplit('/', 1)[-1]
    if not name:
        raise ObjectStoreError(f'{key!r} names no file')
    return name


def missing_settings(config) -> List[str]:
    """Which of the settings this needs are blank, in a stable order."""
    return [name for name in REQUIRED_SETTINGS if not getattr(config, name, '')]


def describe_client_error(code: str, bucket: str, key: str) -> str:
    """One sentence about a store's error code, in the terms an operator thinks in.

    A 403 from an object store is almost never about this object's permissions
    and almost always about the key having been rotated, so it says that. The
    secret is never part of the sentence - these lines end up in a Job log that
    a wider group can read than can read the secret.
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
    """Build an S3 client for the configured store.

    Mirrors get_redis_client: the configuration owns the connection details and
    the caller builds a client from them. No I/O happens here.
    """
    conf = config or get_ingest_config()

    try:
        return boto3.client(
            's3',
            endpoint_url=conf.S3_ENDPOINT_URL,
            aws_access_key_id=conf.S3_ACCESS_KEY_ID,
            aws_secret_access_key=conf.S3_SECRET_ACCESS_KEY,
            region_name=conf.S3_REGION,
            config=BotoConfig(
                # Path style: an S3-compatible store is not certified for
                # <bucket>.<host>, and a bucket name containing a dot breaks TLS
                # verification under virtual-host addressing.
                s3={'addressing_style': 'path'},
                connect_timeout=CONNECT_TIMEOUT,
                read_timeout=READ_TIMEOUT,
                retries={'mode': 'standard', 'max_attempts': MAX_ATTEMPTS},
            ),
        )
    except ValueError as error:
        # botocore validates the endpoint while building the client, before any
        # request, and raises a bare ValueError. Left alone it leaves this
        # function by a path nothing above catches, which exits 1 - the code that
        # means a bad extract arrived - and sends whoever reads the Job looking at
        # the delivery instead of at S3_HOST. This happened for real: a secret
        # created from a copy-pasted command held the literal string '...'.
        raise ObjectStoreError(
            f'S3_HOST does not give a usable endpoint ({conf.S3_ENDPOINT_URL!r}): {error}'
        ) from error


def _download(s3, bucket: str, key: str, destination: Path):
    """Fetch one object, and be sure all of it arrived.

    The size is checked against what the store said it would be, which is the
    guard against a transfer that stopped early - a full disk, a killed pod - and
    left a file that opens as a valid but truncated GeoPackage.

    Not checked against the ETag: a multipart upload's ETag is '<hash>-<parts>'
    rather than the content md5, so that comparison would fail on exactly the
    large objects it would exist to protect. The script's sha256 over these bytes
    is the real identity check.
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
        # Refused rather than defaulted. With no endpoint boto3 would sign for
        # real AWS and send BC Gov credentials there, and the 403 that comes back
        # reads like a permissions problem rather than a missing variable.
        raise ObjectStoreError(f'object storage is not configured: {", ".join(absent)} not set')

    if spec.s3 is None:
        raise ObjectStoreError(
            f'{spec.object_name} has no S3 source in ingest_spec.py; '
            f'load it with --source instead'
        )

    bucket = spec.s3.bucket or conf.S3_BUCKET
    s3 = client(conf)

    print(f'Fetching from {conf.S3_ENDPOINT_URL}/{bucket} ...')
    sources = []
    for key in spec.s3.sources:
        destination = into / local_name(key)
        _download(s3, bucket, key, destination)
        sources.append(destination)

    lyrx = None
    if spec.s3.lyrx:
        lyrx = into / local_name(spec.s3.lyrx)
        _download(s3, bucket, spec.s3.lyrx, lyrx)

    return Delivery(sources=sources, lyrx=lyrx)
