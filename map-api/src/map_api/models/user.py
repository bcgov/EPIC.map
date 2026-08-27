"""Staff user model class.

Manages the staff user
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.orm import column_property

from .base_model import BaseModel
from .db import db


class User(BaseModel):
    """Definition of the User entity."""

    __tablename__ = 'staff_users'

    id = Column(db.Integer, primary_key=True, autoincrement=True)
    first_name = Column(db.String(50))
    middle_name = Column(db.String(50), nullable=True)
    last_name = Column(db.String(50))
    full_name = column_property(first_name + ' ' + last_name)
    # To store the IDP user name..ie IDIR username
    username = Column('username', String(100), index=True, unique=True)
    email_address = Column(db.String(100), nullable=True)
    contact_number = Column(db.String(50), nullable=True)
    auth_guid = Column(db.String(100), index=True, unique=True, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, server_default='t', nullable=False)

    @classmethod
    def get_all(cls):
        """Fetch list of users by access type."""
        return cls.query.all()

    @classmethod
    def find_by_auth_guid(cls, auth_guid: str) -> Optional[User]:
        """Return the active user for an identity provider guid."""
        if not auth_guid:
            return None
        return cls.query.filter_by(auth_guid=auth_guid, is_active=True).first()

    @classmethod
    def find_by_username(cls, username: str) -> Optional[User]:
        """Return the user for an IDIR username."""
        if not username:
            return None
        return cls.query.filter_by(username=username).first()

    @classmethod
    def create_user(cls, user_data) -> User:
        """Create user."""
        user_data = User(
            first_name=user_data.get('first_name', None),
            middle_name=user_data.get('middle_name', None),
            last_name=user_data.get('last_name', None),
            email_address=user_data.get('email_address', None),
            contact_number=user_data.get('contact_number', None),
            username=user_data.get('username', None),
            auth_guid=user_data.get('auth_guid', None),
        )
        user_data.save()
        return user_data

    @classmethod
    def update_user(cls, user_id, user_dict) -> Optional[User]:
        """Update user."""
        query = User.query.filter_by(id=user_id)
        user: User = query.first()
        if not user:
            return None

        query.update(user_dict)
        db.session.commit()
        return user

    @classmethod
    def upsert_from_token(cls, user_data) -> User:
        """Create or refresh the local profile for a signed-in IDIR user.

        Called once per sign-in rather than per request. Keycloak has already
        decided this user may be here; this only keeps the local copy of their
        name and email in step with what the token says.
        """
        auth_guid = user_data.get('auth_guid')
        user = cls.find_by_auth_guid(auth_guid)

        if user is None:
            # A record may pre-exist from before the user first signed in - an
            # admin adding them by IDIR username, or a data load. Claim it
            # rather than colliding on the unique username index.
            user = cls.find_by_username(user_data.get('username'))

        if user is None:
            user = User()
            db.session.add(user)

        user.auth_guid = auth_guid
        user.username = user_data.get('username') or user.username
        user.first_name = user_data.get('first_name') or user.first_name
        user.last_name = user_data.get('last_name') or user.last_name
        user.email_address = user_data.get('email_address') or user.email_address
        user.last_login_at = datetime.utcnow()

        db.session.commit()
        return user
