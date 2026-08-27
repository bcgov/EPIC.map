/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppConfig, OidcConfig } from "@/utils/config";
import axios, { AxiosError, AxiosInstance } from "axios";
import { User } from "oidc-client-ts";
import { CORS_ERROR_MSG } from "@/utils/constants";

export type OnErrorType = (error: AxiosError) => void;
export type OnSuccessType = (data: any) => void;

export function getUser() {
  const oidcStorage = sessionStorage.getItem(
    `oidc.user:${OidcConfig.authority}:${OidcConfig.client_id}`
  );
  if (!oidcStorage) {
    return null;
  }

  return User.fromStorageString(oidcStorage);
}

const onSuccess = (response: any) => response?.data ?? response;

const onError = (error: AxiosError) => {
  if (!error.response) {
    // CORS error or network error
    throw new Error(CORS_ERROR_MSG);
  }
  throw error;
};

function addAuthInterceptor(client: AxiosInstance) {
  client.interceptors.request.use((config) => {
    const user = getUser();
    if (user?.access_token) {
      config.headers.Authorization = `Bearer ${user.access_token}`;
    } else {
      throw new Error("No access token!");
    }
    return config;
  });
}

const apiClient = axios.create({ baseURL: AppConfig.apiUrl });
addAuthInterceptor(apiClient);

// The ops endpoints sit outside the secured API surface, so they are called
// without a token.
const opsClient = axios.create({ baseURL: AppConfig.opsUrl });

export const request = ({ ...options }) => {
  return apiClient(options).then(onSuccess).catch(onError);
};

export const requestOps = ({ ...options }) => {
  return opsClient(options).then(onSuccess).catch(onError);
};
