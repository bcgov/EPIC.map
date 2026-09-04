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
"""Common setup and fixtures for the pytest suite used by this service."""
from random import random

import pytest
from flask_migrate import Migrate, upgrade
from sqlalchemy import text
from sqlalchemy.orm import scoped_session, sessionmaker

from map_api import create_app, setup_jwt_manager
from map_api.auth import jwt as _jwt
from map_api.models import db as _db


@pytest.fixture(scope='session')
def app():
    """Return a session-wide application configured in TEST mode."""
    _app = create_app('testing')

    return _app


@pytest.fixture(scope='function')
def app_request():
    """Return a session-wide application configured in TEST mode."""
    _app = create_app('testing')

    return _app


@pytest.fixture(scope='session')
def client(app):  # pylint: disable=redefined-outer-name
    """Return a session-wide Flask test client."""
    return app.test_client()


@pytest.fixture(scope='session')
def jwt():
    """Return a session-wide jwt manager."""
    return _jwt


@pytest.fixture(scope='session')
def client_ctx(app):  # pylint: disable=redefined-outer-name
    """Return session-wide Flask test client."""
    with app.test_client() as _client:
        yield _client


@pytest.fixture(scope='session')
def db(app):  # pylint: disable=redefined-outer-name, invalid-name
    """Return a session-wide initialised database.

    Drops schema, and recreate.
    """
    with app.app_context():
        # The app schema is dropped too: migrations create app.audit_events
        # unconditionally, so leaving it behind makes a second run fail on
        # "relation already exists" rather than starting from a clean database.
        drop_schema_sql = """DROP SCHEMA IF EXISTS app CASCADE;
                             DROP SCHEMA public CASCADE;
                             CREATE SCHEMA public;
                             GRANT ALL ON SCHEMA public TO CURRENT_USER;
                             GRANT ALL ON SCHEMA public TO public;
                          """

        sess = _db.session()
        # text() is required: SQLAlchemy 2.x refuses a bare string here.
        sess.execute(text(drop_schema_sql))
        sess.commit()

        # ############################################
        # There are 2 approaches, an empty database, or the same one that the app will use
        #     create the tables
        #     _db.create_all()
        # or
        # Use Alembic to load all of the DB revisions including supporting lookup data
        # This is the path we'll use in auth_api!!

        # even though this isn't referenced directly, it sets up the internal configs that upgrade needs
        Migrate(app, _db)
        upgrade()

        return _db


@pytest.fixture(scope='function')
def session(app, db):  # pylint: disable=redefined-outer-name, invalid-name
    """Return a function-scoped session whose writes are rolled back after the test.

    Rewritten for Flask-SQLAlchemy 3.x / SQLAlchemy 2.x, which removed
    create_scoped_session. `join_transaction_mode="create_savepoint"` makes a
    commit() inside a test land on a savepoint within the outer transaction, so
    the rollback below still undoes it - which is what the old
    after_transaction_end listener was hand-rolling.
    """
    with app.app_context():
        conn = db.engine.connect()
        txn = conn.begin()

        factory = sessionmaker(bind=conn, join_transaction_mode='create_savepoint')
        sess = scoped_session(factory)

        original_session = db.session
        db.session = sess

        try:
            yield sess
        finally:
            sess.remove()
            # Undo anything the test committed.
            txn.rollback()
            conn.close()
            db.session = original_session


@pytest.fixture(scope='function')
def client_id():
    """Return a unique client_id that can be used in tests."""
    _id = random.SystemRandom().getrandbits(0x58)
    #     _id = (base64.urlsafe_b64encode(uuid.uuid4().bytes)).replace('=', '')

    return f'client-{_id}'


@pytest.fixture(scope='session', autouse=True)
def auto(app):
    """Initialize the jwt manager against the test keypair.

    In 'testing' the manager runs in test mode: tokens are signed with the
    keypair in TestConfig and verified locally, so no identity provider - and
    no keycloak container - is involved.
    """
    setup_jwt_manager(app, _jwt)


@pytest.fixture()
def auth_mock(monkeypatch):
    """Mock check_auth."""
    pass
