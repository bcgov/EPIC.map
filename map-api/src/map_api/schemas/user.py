"""User schemas.

Serialization of the local user profile that backs an IDIR identity.
"""

from marshmallow import EXCLUDE, Schema, fields


class UserSchema(Schema):
    """User schema."""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    id = fields.Int(data_key='id')
    first_name = fields.Str(data_key='first_name')
    middle_name = fields.Str(data_key='middle_name')
    last_name = fields.Str(data_key='last_name')
    email_address = fields.Str(data_key='email_address')
    contact_number = fields.Str(data_key='contact_number')
    username = fields.Str(data_key='username')
    auth_guid = fields.Str(data_key='auth_guid')
    last_login_at = fields.DateTime(data_key='last_login_at')
    is_active = fields.Bool(data_key='is_active')


class UserRequestSchema(Schema):
    """User Request Schema"""

    class Meta:  # pylint: disable=too-few-public-methods
        """Exclude unknown fields in the deserialized output."""

        unknown = EXCLUDE

    first_name = fields.Str(data_key='first_name')
    middle_name = fields.Str(data_key='middle_name')
    last_name = fields.Str(data_key='last_name')
    email_address = fields.Str(data_key='email_address')
    contact_number = fields.Str(data_key='contact_number')
    username = fields.Str(data_key='username')


class CurrentUserSchema(UserSchema):
    """The signed-in user, with what the token entitles them to do.

    Permissions are reported from the token rather than stored locally -
    keycloak is the source of truth, and a role revoked there must not survive
    in a database row.
    """

    permissions = fields.List(fields.Str(), data_key='permissions')
