/**
 * Thin HTTP client for the Voicelink REST API.
 *
 * Authentication is Sanctum Bearer (see OpenAPI). For v1 we use a
 * long-lived reseller token issued in the Voicelink UI (env
 * VOICELINK_RESELLER_TOKEN). Username/password login is structurally
 * supported but not wired into env until a use case appears.
 *
 * Tests inject `fetchImpl` to mock HTTP without touching the network.
 */

import { createLogger } from "../../../lib/logger.js";

const log = createLogger("voicelink-client");

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface VoicelinkClientOptions {
  /** Defaults to env VOICELINK_API_BASE or https://app.voicelink.co.in/api */
  apiBase?: string;
  /** Defaults to env VOICELINK_RESELLER_TOKEN */
  bearerToken?: string;
  /** Inject a custom fetch (defaults to globalThis.fetch) */
  fetch?: FetchLike;
  /** Per-request timeout in ms (default 15000) */
  timeoutMs?: number;
}

export interface VoicelinkApiError extends Error {
  status: number;
  body?: unknown;
}

const DEFAULT_API_BASE = "https://app.voicelink.co.in/api";

export class VoicelinkClient {
  private readonly apiBase: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: VoicelinkClientOptions = {}) {
    this.apiBase = (opts.apiBase ?? process.env.VOICELINK_API_BASE ?? DEFAULT_API_BASE)
      .replace(/\/+$/, "");
    this.bearerToken = opts.bearerToken ?? process.env.VOICELINK_RESELLER_TOKEN ?? "";
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    if (!this.bearerToken) {
      log.warn(
        "VOICELINK_RESELLER_TOKEN is empty — real Voicelink calls will fail (Q3 unresolved)",
      );
    }
  }

  /** Low-level request helper. Returns parsed JSON body. */
  async request<T = unknown>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${this.bearerToken}`,
        },
        signal: controller.signal,
      };
      if (body !== undefined) init.body = JSON.stringify(body);

      const res = await this.fetchImpl(url, init);
      const text = await res.text();
      let parsed: unknown = undefined;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
      if (!res.ok) {
        const err = new Error(
          `Voicelink ${method} ${path} → ${res.status}`,
        ) as VoicelinkApiError;
        err.status = res.status;
        err.body = parsed;
        throw err;
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
