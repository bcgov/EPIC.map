/**
 * Reading the signed-in user out of the host's access token.
 *
 * This is a demonstration that the widget can see who the host has signed in
 * without owning a session of its own: the claims below come from the same
 * token `getAccessToken` already hands over for API calls.
 *
 * The payload is decoded, never verified. A browser cannot verify a signature it
 * has no key for, and it does not need to: these claims are for display, and
 * map-api validates the token it is given before trusting anything in it. Never
 * make an authorisation decision from this.
 */

/** The parts of the host's session the widget displays. */
export interface HostIdentity {
  /** Keycloak `name` — the user's display name. */
  name?: string;
  /** Keycloak `preferred_username`. */
  preferredUsername?: string;
}

/** The claims we read. Everything else in the token is deliberately ignored. */
interface TokenClaims {
  name?: unknown;
  preferred_username?: unknown;
}

const decodeBase64Url = (segment: string): string => {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  // atob yields one character per byte; JWT payloads are UTF-8, so the bytes
  // have to be decoded as such or a non-ASCII name comes back mangled.
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Pull the display claims out of a JWT.
 *
 * Returns `null` for anything that is not a readable JWT payload — an opaque
 * token is a legitimate thing for a host to hand us, so this reports "nothing to
 * show" rather than throwing.
 */
export const decodeHostIdentity = (token: string): HostIdentity | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;

  let claims: TokenClaims;
  try {
    claims = JSON.parse(decodeBase64Url(payload)) as TokenClaims;
  } catch {
    return null;
  }

  const identity: HostIdentity = {
    name: asString(claims.name),
    preferredUsername: asString(claims.preferred_username),
  };

  return identity.name || identity.preferredUsername ? identity : null;
};
