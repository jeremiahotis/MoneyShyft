import type { APIRequestContext, APIResponse } from '@playwright/test';

type RequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  data?: unknown;
  headers?: Record<string, string>;
};

export async function apiRequest(
  request: APIRequestContext,
  options: RequestOptions,
): Promise<APIResponse> {
  const defaultApiBaseUrl = 'http://localhost:3000';
  const configuredApiBaseUrl = process.env.API_URL || process.env.API_BASE_URL || defaultApiBaseUrl;
  const requestUrl = options.path.startsWith('/api/')
    ? new URL(options.path, configuredApiBaseUrl).toString()
    : options.path;

  return request.fetch(requestUrl, {
    method: options.method,
    data: options.data,
    headers: options.headers,
  });
}
