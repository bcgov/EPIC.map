"""The App Initiation file.

This module is for the initiation of the flask app.
"""

import os

from http import HTTPStatus
import secure
from flask import Flask, current_app, g, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, Unauthorized

from map_api.auth import jwt
from map_api.config import PRODUCTION_LIKE_ENVIRONMENTS, get_named_config
from map_api.exceptions import PermissionDeniedError
from map_api.models import db, ma, migrate
from map_api.services.audit_service import AuditService
from map_api.utils import token as token_utils
from map_api.utils.cache import cache

# Security Response headers
csp = (
    secure.ContentSecurityPolicy()
    .default_src("'self'")
    .script_src("'self'", "'unsafe-inline'")
    .style_src("'self'", "'unsafe-inline'")
    .img_src("'self'", "data:")
    .object_src("'self'")
    .connect_src("'self'")
)

hsts = secure.StrictTransportSecurity().include_subdomains().preload().max_age(31536000)
referrer = secure.ReferrerPolicy().no_referrer()
cache_value = secure.CacheControl().no_store().max_age(0)
xfo_value = secure.XFrameOptions().deny()
secure_headers = secure.Secure(
    csp=csp, hsts=hsts, referrer=referrer, cache=cache_value, xfo=xfo_value
)


@jwt.requires_auth
def _verify_bearer_token():
    """Verify the request's bearer token and return its claims.

    flask-jwt-oidc only exposes verification through its decorators, so this is
    a no-op handler wrapped in one. Going through the real verification here -
    signature, issuer, audience and expiry - rather than reading unverified
    claims means the group check below is made against a token that has already
    been proven genuine.
    """
    return g.jwt_oidc_token_info


def create_app(run_mode=os.getenv("FLASK_ENV", "development")):
    """Create flask app."""
    # pylint: disable=import-outside-toplevel
    from map_api.resources import (
        API_BLUEPRINT,
        DOC_PATHS,
        DOCS_ENABLED,
        OPS_BLUEPRINT,
        URL_PREFIX,
    )

    # Flask app initialize
    app = Flask(__name__)

    # All configuration are in config file
    app.config.from_object(get_named_config(run_mode))

    # One list of browser origins per environment, covering every EPIC
    # application that embeds the map - see CORS_ORIGINS in config.py.
    #
    # Credentials are deliberately not enabled: callers authenticate with a
    # bearer token in the Authorization header, not with a cookie. Turning
    # supports_credentials on would ask browsers to send ambient cookies
    # cross-origin, which this API neither needs nor reads.
    CORS(
        app,
        resources={r"/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=False,
    )

    # Register blueprints
    app.register_blueprint(API_BLUEPRINT)  # Create the database (run once)
    app.register_blueprint(OPS_BLUEPRINT)

    # Setup jwt for keycloak
    setup_jwt_manager(app, jwt)

    # Database connection initialize
    db.init_app(app)

    # # Database migrate initialize
    migrate.init_app(app, db)

    # Marshmallow initialize
    ma.init_app(app)

    @app.before_request
    def set_origin():
        g.origin_url = request.environ.get("HTTP_ORIGIN", "localhost")

    @app.before_request
    def authenticate():
        """Require a valid IDIR token on everything under the API prefix.

        Individual resources still carry @auth.require / @auth.has_one_of_roles
        for their own role checks; this is the floor beneath them, so a new
        endpoint added without a decorator is not reachable anonymously.
        """
        g.access_token = None
        g.token_info = None

        # CORS preflight never carries an Authorization header; let flask-cors
        # answer it. Only the API blueprint is gated - /ops health probes and
        # anything else stay open.
        if request.method == "OPTIONS" or not (request.path + "/").startswith(URL_PREFIX):
            return

        # Swagger UI and its spec are only registered outside production-like
        # environments; where they exist they are reachable without a token.
        if DOCS_ENABLED and request.path.rstrip("/") in DOC_PATHS:
            return

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise Unauthorized("Authorization header is required")

        token_info = _verify_bearer_token()

        # The EAO realm is shared across the EPIC applications, so once the
        # realm has a group for this app, a genuine token is not by itself
        # permission to be here. No-op while AUTH_REQUIRED_GROUP is unset.
        if not token_utils.belongs_to_app(token_info):
            current_app.logger.warning(
                "Rejected %s: token carries groups %s, none of which match "
                "AUTH_REQUIRED_GROUP=%s",
                token_utils.auth_guid(token_info),
                token_utils.groups(token_info),
                app.config.get("AUTH_REQUIRED_GROUP"),
            )
            raise PermissionDeniedError(
                "You do not have access to this application."
            )

        g.access_token = auth_header.split(" ")[1]
        g.token_info = token_info

    build_cache(app)

    if not app.config.get("CORS_ORIGINS"):
        app.logger.warning(
            "CORS_ORIGINS is empty: no browser origin can call this API. Set "
            "CORS_ORIGIN to the list of EPIC application origins for this "
            "environment."
        )

    if not app.config.get("AUTH_REQUIRED_GROUP"):
        app.logger.warning(
            "AUTH_REQUIRED_GROUP is not set: every valid IDIR token from the "
            "realm is accepted, including staff who only work in the other "
            "EPIC applications. Set it once the realm has a group for this app."
        )

    @app.after_request
    def write_audit_event(response):
        """Record which application made this call.

        Placed here rather than on each resource so a new endpoint is audited
        the day it is written, without anyone remembering to decorate it. Only
        authenticated API calls are recorded: g.token_info is set by the
        authenticate() hook above and is None for /ops probes, swagger, CORS
        preflight and anything rejected before the token was verified.

        host_app comes from the verified token's azp claim - see
        AuditService.record.

        A failure to write the audit row must not turn a successful call into a
        500 for the user, so it is logged and swallowed. That is a deliberate
        trade: this is an activity log, not a ledger the response depends on.
        """
        token_info = getattr(g, "token_info", None)
        if token_info is None:
            return response

        try:
            AuditService.record(
                token_info,
                method=request.method,
                path=request.path,
                status_code=response.status_code,
            )
        except Exception:  # noqa: B902; pylint: disable=broad-except
            db.session.rollback()
            current_app.logger.exception("Failed to write audit event")

        return response

    @app.after_request
    def set_secure_headers(response):
        """Set CORS headers for security."""
        secure_headers.set_headers(response)
        response.headers.add("Cross-Origin-Resource-Policy", "*")
        response.headers["Cross-Origin-Opener-Policy"] = "*"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
        return response

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Return HTTP errors as JSON, the shape the web client expects."""
        return (
            jsonify({"message": error.description or str(error), "status": error.code}),
            error.code,
        )

    @app.errorhandler(Exception)
    def handle_error(err):
        if run_mode not in PRODUCTION_LIKE_ENVIRONMENTS:
            # To get stacktrace in local development for internal server errors
            raise err
        current_app.logger.error(str(err))
        return (
            jsonify({"message": "Internal server error", "status": 500}),
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )

    # Return App for run in run.py file
    return app


def build_cache(app):
    """Build cache."""
    cache.init_app(app)


def setup_jwt_manager(app_context, jwt_manager):
    """Use flask app to configure the JWTManager to work for a particular Realm."""

    def get_roles(a_dict):  # pylint: disable=unused-argument
        """Return no roles: role based gating is switched off for now.

        Client roles used to be read from resource_access[<this client>]. That
        stopped being safe once several EPIC applications began calling this
        API: resource_access is scoped per keycloak client, so the same officer
        carries different roles depending on which application they opened the
        map in, and the API would grant different access for the same person.

        The mechanism above this - Auth.has_one_of_roles, GROUP_MAP - is left in
        place and simply matches nothing, so it is ready for a role source that
        means the same thing in every client (a realm role, or a role on a
        dedicated epic-map-api client). No endpoint uses it today.
        """
        return []

    app_context.config["JWT_ROLE_CALLBACK"] = get_roles
    jwt_manager.init_app(app_context)
