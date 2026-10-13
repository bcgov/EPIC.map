import axios, { CanceledError, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it, vi } from "vitest";
import type { MapWidgetError } from "@/types";
import { createApiClient } from "@/utils/apiClient";
import { createPublicClient } from "@/utils/publicClient";

/** Fails every request the way an aborted one fails. */
const cancelling = () => () => Promise.reject(new CanceledError("canceled"));

/** Fails every request the way an unreachable server does. */
const offline = () => () =>
  Promise.reject(new axios.AxiosError("Network Error"));

/** Answers every request with one status, the way a real server would. */
const answering = (status: number) => (config: InternalAxiosRequestConfig) =>
  Promise.reject(
    new axios.AxiosError(`Request failed with status code ${status}`, undefined, config, null, {
      status,
      statusText: "",
      headers: {},
      config,
      data: "",
    }),
  );

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

describe("statuses a caller handles itself", () => {
  const client = () => {
    const onError = vi.fn<(error: MapWidgetError) => void>();
    const api = createApiClient({
      apiBaseUrl: "https://example.invalid",
      getAccessToken: async () => "token",
      onError,
    });
    return { api, onError };
  };

  it("does not report a status the caller claimed", async () => {
    const { api, onError } = client();
    api.defaults.adapter = answering(404);

    // An endpoint that is not built yet is an answer, not a fault. Reporting it
    // would train a host to ignore onError.
    await expect(
      api.get("/projects", { epicMapSilentStatuses: [404] }),
    ).rejects.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  it("still throws, so the caller can act on it", async () => {
    const { api } = client();
    api.defaults.adapter = answering(404);

    // Silencing the host is not swallowing the failure - the hook still has to
    // see it to return its empty list.
    await expect(
      api.get("/projects", { epicMapSilentStatuses: [404] }),
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it("still reports a status the caller did not claim", async () => {
    const { api, onError } = client();
    api.defaults.adapter = answering(500);

    await expect(
      api.get("/projects", { epicMapSilentStatuses: [404] }),
    ).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "server" }),
    );
  });

  it("reports the same status on a request that did not claim it", async () => {
    const { api, onError } = client();
    api.defaults.adapter = answering(404);

    await expect(api.get("/users/me/layers")).rejects.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});
