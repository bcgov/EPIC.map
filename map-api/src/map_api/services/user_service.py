"""Service for user management."""
from map_api.models.user import User as UserModel
from map_api.utils.constant import DEFAULT_PERMISSIONS, GROUP_MAP
from map_api.utils.token import roles as roles_from_token
from map_api.utils.token import user_data_from_token


class UserService:
    """User management service."""

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
    def get_permission_levels(cls, token_info):
        """Return the permissions the signed-in user holds.

        Roles are still to be decided, so every authenticated IDIR user starts
        with DEFAULT_PERMISSIONS; any client role the token happens to carry is
        added on top. Once the roles exist in keycloak, emptying
        DEFAULT_PERMISSIONS is all it takes to make the token the only source.
        """
        token_roles = set(roles_from_token(token_info))
        granted = [
            permission
            for permission, role in GROUP_MAP.items()
            if role in token_roles
        ]
        for permission in DEFAULT_PERMISSIONS:
            if permission not in granted:
                granted.append(permission)
        return granted
