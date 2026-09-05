---
"@bcgov/epic-map": patch
---

Show whether map-api trusts the host's token.

The map surface now calls `GET /users/me` and reports the result beside the
decoded claim, because the two say different things: a claim proves the host's
token reached the widget, while a 200 from map-api proves the signature was
checked against Keycloak's JWKS, the issuer, expiry and `azp` allowlist passed,
and a map-db record was read. 401, 403 and an unreachable API are reported
distinctly.

No new props. This is the package's first call to map-api.
