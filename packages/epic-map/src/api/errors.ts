import axios from "axios";
import type { MapWidgetError, MapWidgetErrorKind } from "@/types";

/**
 * Everything that turns a thrown value into the host-facing `MapWidgetError`.
 *
 * Separate from `client.ts` on purpose: hooks and components need to classify a
 * failure without pulling in the axios instance factory, and the mapping from
 * HTTP status to `kind` is part of the package's public contract even though the
 * function that does it is not exported.
 */

/** Thrown when the host's `getAccessToken` rejects. */
export class AccessTokenError extends Error {
  /** Whatever the host's getAccessToken rejected with. */
  readonly reason: unknown;

  constructor(reason: unknown) {
    // Not `new Error(msg, { cause })`: that is ES2022 and this package compiles
    // against the ES2020 lib that the rest of the repo uses.
    super("The host could not supply an access token");
    this.name = "AccessTokenError";
    this.reason = reason;
  }
}

const kindForStatus = (status: number | undefined): MapWidgetErrorKind => {
  if (status === undefined) return "network";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  if (status >= 400) return "request";
  return "unknown";
};

/** Normalise anything thrown during a request into the host-facing error shape. */
export const toMapWidgetError = (error: unknown): MapWidgetError => {
  if (error instanceof AccessTokenError) {
    return { kind: "auth", message: error.message, cause: error.reason };
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return {
      kind: kindForStatus(status),
      message: error.message,
      status,
      cause: error,
    };
  }

  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  };
};
