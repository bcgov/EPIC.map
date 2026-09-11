import axios, { type AxiosInstance } from "axios";
import type { MapWidgetError } from "@/types";
import { toMapWidgetError } from "@/utils/errors";


export const PUBLIC_REQUEST_TIMEOUT_MS = 15000;

export interface PublicClientOptions {
  onError?: (error: MapWidgetError) => void;
}

/**
 * The widget's client for public, unauthenticated services — the BC Data
 * Catalogue and openmaps.gov.bc.ca.
 */
export const createPublicClient = ({
  onError,
}: PublicClientOptions): AxiosInstance => {
  const client = axios.create({ timeout: PUBLIC_REQUEST_TIMEOUT_MS });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const normalised = toMapWidgetError(error);

      onError?.(
        normalised.kind === "auth"
          ? { ...normalised, kind: "request" }
          : normalised,
      );

      throw error;
    },
  );

  return client;
};
