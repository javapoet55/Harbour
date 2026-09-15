import { getApiUrl } from '../config';
import { createApiClient, type ApiClient } from './client';
import type { LoginResponse, ProfileResponse, TasksResponse } from './types';

export * from './client';
export type * from './types';

let instance: ApiClient | undefined;

/** The app-wide client for the configured API origin, created on first use. */
export function getApi(): ApiClient {
  instance ??= createApiClient({ baseUrl: getApiUrl() });
  return instance;
}

export const endpoints = {
  // A 401 from sign-in means wrong credentials, not an expired session.
  login: (email: string, password: string, client: ApiClient = getApi()) =>
    client.post<LoginResponse>('/api/auth/login', { email, password }, { signedOutOn401: false }),
  logout: (client: ApiClient = getApi()) => client.post<{ ok: boolean }>('/api/auth/logout', undefined, { signedOutOn401: false }),
  me: (client: ApiClient = getApi()) => client.get<ProfileResponse>('/api/me'),
  tasks: (client: ApiClient = getApi()) => client.get<TasksResponse>('/api/tasks'),
};
