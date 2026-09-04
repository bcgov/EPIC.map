import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type { MapWidgetError } from "@/types";
import { AccessTokenError, toMapWidgetError } from "@/api/errors";

/**
 * Requests carry a flag once they have been retried, so a 401 can be retried
 * exactly once. Without it a token the API keeps rejecting would loop forever.
 */
interface RetryableConfig extends InternalAxiosRequestConfig {
  epicMapRetried?: boolean;
}

export interface ApiClientOptions {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string>;
  onError?: (error: MapWidgetError) => void;
}

/**
 * Builds the widget's axios instance.
 *
 * The instance is private to one widget instance: it is never handed to the host
 * and never reads ambient credentials. Every token comes from `getAccessToken`.
 */
export const createApiClient = ({
  apiBaseUrl,
  getAccessToken,
  onError,
}: ApiClientOptions): AxiosInstance => {
  const client = axios.create({ baseURL: apiBaseUrl });

  client.interceptors.request.use(async (config) => {
    let token: string;
    try {
      token = await getAccessToken();
    } catch (cause) {
      // Tag it so the response handler can report it as an auth failure rather
      // than as an unrecognised throw.
      throw new AccessTokenError(cause);
    }
    config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const config = axios.isAxiosError(error)
        ? (error.config as RetryableConfig | undefined)
        : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (status === 401 && config && !config.epicMapRetried) {
        config.epicMapRetried = true;
        // Re-issuing through `client` runs the request interceptor again, which
        // is what calls getAccessToken() a second time — giving a host that
        // refreshes on demand the chance to hand over a fresh token.
        return client.request(config);
      }

      // Second attempt failed, or the failure was never about the token.
      //
      // Report and rethrow. We deliberately do NOT redirect to a login page:
      // this widget renders inside a host tab, and navigating away would destroy
      // the host's page state. Re-authentication is the host's call.
      onError?.(toMapWidgetError(error));
      throw error;
    },
  );

  return client;
};
