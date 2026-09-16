import axios, { CanceledError } from "axios";
import { describe, expect, it, vi } from "vitest";
import type { MapWidgetError } from "@/types";
import { createApiClient } from "@/utils/apiClient";
import { createPublicClient } from "@/utils/publicClient";

/** Fails every request the way an aborted one fails. */
const cancelling = () => () => Promise.reject(new CanceledError("canceled"));

/** Fails every request the way an unreachable server does. */
const offline = () => () =>
  Promise.reject(new axios.AxiosError("Network Error"));

describe("request cancellation", () => {
  it("does not report a cancelled authenticated request to the host", async () => {
    const onError = vi.fn<(error: MapWidgetError) => void>();
    const client = createApiClient({
      apiBaseUrl: "https://example.invalid",
      getAccessToken: async () => "token",
      onError,
    });
    client.defaults.adapter = cancelling();

    // Query cancels the in-flight GET whenever an optimistic write starts, so a
    // toggled layer must not look to the host like a network failure.
    await expect(client.get("/users/me/layers")).rejects.toThrow(CanceledError);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not report a cancelled public request to the host", async () => {
    const onError = vi.fn<(error: MapWidgetError) => void>();
    const client = createPublicClient({ onError });
    client.defaults.adapter = cancelling();

    await expect(client.get("https://example.invalid")).rejects.toThrow(
      CanceledError,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("still reports a failure that is not a cancellation", async () => {
    const onError = vi.fn<(error: MapWidgetError) => void>();
    const client = createApiClient({
      apiBaseUrl: "https://example.invalid",
      getAccessToken: async () => "token",
      onError,
    });
    client.defaults.adapter = offline();

    await expect(client.get("/users/me/layers")).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "network" }),
    );
  });
});
