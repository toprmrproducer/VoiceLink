// Thin typed fetch wrapper for the platform API.
// Server Components and Server Actions both call through this so the
// session cookie is forwarded automatically. Client Components should
// hit Next route handlers under app/api/* (which proxy to here) rather
// than the API directly.

import { cookies } from "next/headers";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

const SESSION_COOKIE = "vp_session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!res.ok) {
    const message =
      (json as { error?: string } | undefined)?.error ??
      `API ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, json);
  }
  return json;
}

export const api = {
  get: <T>(path: string) =>
    authedFetch(path, { method: "GET" }).then(unwrap<T>),

  post: <T>(path: string, body?: unknown) =>
    authedFetch(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(unwrap<T>),

  put: <T>(path: string, body?: unknown) =>
    authedFetch(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(unwrap<T>),

  del: <T>(path: string) =>
    authedFetch(path, { method: "DELETE" }).then(unwrap<T>),
};

export { SESSION_COOKIE, API_BASE };
