"""Service for user management."""
from flask import g
from werkzeug.exceptions import Unauthorized

from map_api.models.user import User as UserModel
from map_api.utils.constant import DEFAULT_PERMISSIONS
from map_api.utils.token import auth_guid as auth_guid_from_token
from map_api.utils.token import user_data_from_token


class UserService:
    """User management service."""

    @classmethod
    def current_user(cls):
        """Return the staff_users record for the caller, creating it if absent.

        Provisioned on first touch, like GET /users/me, so an embedded widget
        that never calls it still works. Read first, upsert only on a miss, to
        keep a plain read from bumping last_login_at.

        Do not cache this on `g`: Flask reuses an already-pushed app context, so
        under an outer app_context() one request's user would be served to the
        next.
        """
        token_info = getattr(g, 'token_info', None)
        if not token_info:
            # Unreachable behind the authenticate() hook; fails closed if a
            # resource is ever wired up without it.
            raise Unauthorized('A signed-in user is required.')

        user = cls.get_user_by_auth_guid(auth_guid_from_token(token_info))
        if user is None:
            user = cls.sync_user_from_token(token_info)

        return user

    @classmethod
    def get_user_by_id(cls, _user_id):
        """Get user by id."""
        db_user = UserModel.find_by_id(_user_id)
        return db_user

    @classmethod
    def get_all_users(cls):
        """Get all users."""
        users = UserModel.get_all()
        return users

    @classmethod
    def get_user_by_auth_guid(cls, auth_guid):
        """Get user by identity provider guid."""
        return UserModel.find_by_auth_guid(auth_guid)

    @classmethod
    def create_user(cls, user_data):
        """Create user."""
        created_user = UserModel.create_user(user_data)
        return created_user

    @classmethod
    def update_user(cls, user_id, user_data):
        """Update user."""
        updated_user = UserModel.update_user(user_id, user_data)
        return updated_user

    @classmethod
    def delete_user(cls, user_id):
        """Update user."""
        user = UserModel.find_by_id(user_id)
        if not user:
            return None

        user.delete()
        return user

    @classmethod
    def sync_user_from_token(cls, token_info):
        """Create or refresh the local profile for the signed-in IDIR user."""
        return UserModel.upsert_from_token(user_data_from_token(token_info))

    @classmethod
    def get_permission_levels(cls, token_info):  # pylint: disable=unused-argument
        """Return the permissions the signed-in user holds.

        Every valid IDIR token in the realm gets DEFAULT_PERMISSIONS and nothing
        else. Client roles from resource_access are deliberately not consulted:
        this API is called by several EPIC applications, each with its own
        keycloak client, and those roles are scoped per client - reading them
        would give the same officer different access depending on which
        application they opened the map in.

        The token argument is kept so that a role source which means the same
        thing in every client can be read here later without changing callers.
        """
        return list(DEFAULT_PERMISSIONS)
