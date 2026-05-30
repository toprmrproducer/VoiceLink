import type { WebSocket } from "ws";

import type { RealtimeProvider } from "../adapters/llm/types.js";
import { createLogger } from "../lib/logger.js";
import {
  mulaw8kToPcm16_24k,
  pcm16_24kToMulaw8k,
  makeResampleState,
  type ResampleState,
} from "./audio-pipeline.js";

const log = createLogger("session");

/**
 * Audio format pairs the session knows how to bridge.
 *
 * - `passthrough` (default for tests): no conversion. Whatever bytes
 *   arrive in `media.payload` are forwarded verbatim to
 *   `provider.sendAudio()`, and provider audio frames are forwarded
 *   verbatim back. Used by the echo-bot test + FakeRealtimeProvider.
 *
 * - `mulaw8k-pcm16_24k`: telephony carries µ-law 8 kHz; the realtime
 *   model speaks PCM16 24 kHz (OpenAI Realtime, Gemini Live default).
 *   Convert at both directions of the boundary. Outbound conversion
 *   keeps a `ResampleState` so we don't drop samples at frame edges.
 */
export type SessionAudioFormat = "passthrough" | "mulaw8k-pcm16_24k";

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
  /**
   * Audio bridging mode. Defaults to `passthrough` for back-compat with
   * existing tests; production telephony paths set `mulaw8k-pcm16_24k`.
   */
  audioFormat?: SessionAudioFormat;
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
 * telephony side is the Twilio-style envelope (Voicelink confirmed
 * compatible 2026-05-28).
 *
 * Frame shapes:
 *   - `{event:"start", start:{callSid, streamSid, customParameters}}`
 *     — first frame, identifies the call.
 *   - `{event:"media", media:{payload: <base64 mulaw>}}` — audio.
 *   - `{event:"text", text}` — out-of-band text inject (tests, tools).
 *   - `{event:"clear"}` — caller interrupted (barge-in signal).
 *   - `{event:"stop"}` — clean close.
 */
export class CallSession {
  private startedAt = Date.now();
  private started = false;
  /** Outbound resampler state — preserved across audio frames. */
  private outboundResample: ResampleState = makeResampleState();

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
      // Convert provider PCM16 24 kHz → telephony µ-law 8 kHz when needed.
      // Stateful: the resampler holds 0–2 samples between calls so we
      // don't drop a fraction of a frame at chunk boundaries.
      const wireFrame =
        this.cfg.audioFormat === "mulaw8k-pcm16_24k"
          ? pcm16_24kToMulaw8k(frame, this.outboundResample)
          : frame;
      this.socket.send(
        JSON.stringify({
          event: "media",
          media: { payload: wireFrame.toString("base64") },
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
      const wireFrame = Buffer.from(msg.media.payload, "base64");
      // Convert telephony µ-law 8 kHz → provider PCM16 24 kHz when needed.
      // This direction is stateless: every frame upsamples cleanly without
      // needing to remember tail samples.
      const providerFrame =
        this.cfg.audioFormat === "mulaw8k-pcm16_24k"
          ? mulaw8kToPcm16_24k(wireFrame)
          : wireFrame;
      this.cfg.provider.sendAudio(providerFrame);
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
