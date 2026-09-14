import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { AccessTokenError, toMapWidgetError } from "@/utils/errors";

/** An axios error carrying a response, as the interceptors see one. */
const responseError = (status: number) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    undefined,
    undefined,
    {
      status,
      statusText: "",
      data: undefined,
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );

describe("toMapWidgetError", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "request"],
    [500, "server"],
  ])("maps HTTP %i to kind %s", (status, kind) => {
    const error = toMapWidgetError(responseError(status));
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it("treats a request that never got a response as a network failure", () => {
    expect(toMapWidgetError(new AxiosError("Network Error")).kind).toBe(
      "network",
    );
  });

  it("reports a rejected getAccessToken as auth, keeping the host's reason", () => {
    const reason = new Error("session expired");
    const error = toMapWidgetError(new AccessTokenError(reason));

    expect(error.kind).toBe("auth");
    expect(error.cause).toBe(reason);
  });

  it("does not choke on something that is not an Error", () => {
    expect(toMapWidgetError("just a string")).toMatchObject({
      kind: "unknown",
      message: "just a string",
    });
  });
});
