import type { WebSocket } from "ws";

import type { RealtimeProvider } from "../adapters/llm/types.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("session");

export interface SessionConfig {
  callId: string;
  provider: RealtimeProvider;
  greeting?: string;
  /**
   * If true, the session waits for a `{event:"start"}` frame before
   * connecting to the realtime provider — this is the Twilio/Voicelink
   * pattern where the call SID + custom parameters arrive in the first
   * frame after the WS upgrade. If false (or omitted), the session
   * connects + greets immediately on `start()` — used for the outbound
   * path where we already know the identity from the URL.
   */
  waitForStartFrame?: boolean;
  /**
   * Called on the first inbound `{event:"start"}` frame so the WS
   * router can backfill the call's `providerCallId` and any
   * `customParameters` Voicelink round-trips to us.
   */
  onStartFrame?: (info: StartFrameInfo) => void;
}

export interface StartFrameInfo {
  /** Provider-assigned call id (Twilio: callSid; Voicelink: unique_id). */
  providerCallId?: string;
  /** Streaming session id (Twilio: streamSid). */
  streamSid?: string;
  /** Optional metadata the provider round-tripped from originateCall. */
  customParameters?: Record<string, string>;
}

/**
 * Owns a single call's WS connection from the telephony side and pumps
 * audio + text to/from a RealtimeProvider. Protocol shape on the
 * telephony side is provider-specific; this session accepts the
 * Twilio-style frame envelope which matches both Twilio (VAPP) and the
 * assumed Voicelink shape (confirm under Q1 once the real Voicelink
 * call lands).
 *
 * Frame shapes:
 *   - `{event:"start", start:{callSid, streamSid, customParameters}}`
 *     — first frame, identifies the call.
 *   - `{event:"media", media:{payload: <base64 mulaw>}}` — audio.
 *   - `{event:"text", text}` — out-of-band text inject (tests, tools).
 *   - `{event:"stop"}` — clean close.
 */
export class CallSession {
  private startedAt = Date.now();
  private started = false;

  constructor(
    private socket: WebSocket,
    private cfg: SessionConfig,
  ) {}

  async start(): Promise<void> {
    this.socket.on("message", (raw) => this.onMessage(raw.toString()));
    this.socket.on("close", () => this.close());
    this.socket.on("error", (err) => {
      log.warn({ callId: this.cfg.callId, err }, "socket error");
    });

    if (!this.cfg.waitForStartFrame) {
      await this.bootProvider();
    }
  }

  private async bootProvider(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.cfg.provider.connect();

    this.cfg.provider.onAudio((frame) => {
      if (this.socket.readyState !== this.socket.OPEN) return;
      this.socket.send(
        JSON.stringify({
          event: "media",
          media: { payload: frame.toString("base64") },
        }),
      );
    });
    this.cfg.provider.onError((err) => {
      log.error({ callId: this.cfg.callId, err }, "provider error");
    });

    if (this.cfg.greeting) {
      this.cfg.provider.sendText(this.cfg.greeting);
    }
  }

  private onMessage(raw: string): void {
    let msg: {
      event?: string;
      media?: { payload?: string };
      text?: string;
      start?: {
        callSid?: string;
        streamSid?: string;
        customParameters?: Record<string, string>;
      };
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.event === "start") {
      if (this.cfg.onStartFrame) {
        this.cfg.onStartFrame({
          providerCallId: msg.start?.callSid,
          streamSid: msg.start?.streamSid,
          customParameters: msg.start?.customParameters,
        });
      }
      // Boot the realtime provider now if we were waiting for identity.
      this.bootProvider().catch((err) => {
        log.error({ callId: this.cfg.callId, err }, "provider boot failed");
        this.close();
      });
      return;
    }

    if (!this.started) {
      // Discard pre-start frames — we shouldn't be receiving media
      // before the provider has been connected.
      return;
    }

    if (msg.event === "media" && msg.media?.payload) {
      this.cfg.provider.sendAudio(Buffer.from(msg.media.payload, "base64"));
    } else if (msg.event === "text" && msg.text) {
      this.cfg.provider.sendText(msg.text);
    } else if (msg.event === "stop") {
      this.close();
    }
  }

  async close(): Promise<void> {
    const ms = Date.now() - this.startedAt;
    log.info({ callId: this.cfg.callId, ms }, "session closed");
    if (this.started) {
      await this.cfg.provider.close();
    }
    if (this.socket.readyState === this.socket.OPEN) this.socket.close();
  }
}
