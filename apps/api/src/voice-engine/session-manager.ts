import type { WebSocket } from "ws";

import type { RealtimeProvider } from "../adapters/llm/types.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("session");

export interface SessionConfig {
  callId: string;
  provider: RealtimeProvider;
  greeting?: string;
}

/**
 * Owns a single call's WS connection from the telephony side and pumps
 * audio + text to/from a RealtimeProvider. Protocol shape on the
 * telephony side is provider-specific; this skeleton accepts the
 * Twilio-style frame envelope { event, media: { payload } } since that
 * matches both Twilio (VAPP today) and the assumed Voicelink shape
 * (confirm under Q1 once the real Voicelink call lands).
 */
export class CallSession {
  private startedAt = Date.now();

  constructor(
    private socket: WebSocket,
    private cfg: SessionConfig,
  ) {}

  async start(): Promise<void> {
    await this.cfg.provider.connect();

    this.cfg.provider.onAudio((frame) => {
      // Telephony expects mulaw base64 in the same envelope shape.
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

    this.socket.on("message", (raw) => this.onMessage(raw.toString()));
    this.socket.on("close", () => this.close());

    if (this.cfg.greeting) {
      this.cfg.provider.sendText(this.cfg.greeting);
    }
  }

  private onMessage(raw: string): void {
    let msg: { event?: string; media?: { payload?: string }; text?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.event === "media" && msg.media?.payload) {
      this.cfg.provider.sendAudio(Buffer.from(msg.media.payload, "base64"));
    } else if (msg.event === "text" && msg.text) {
      // Out-of-band text inject (test harness, agent tools)
      this.cfg.provider.sendText(msg.text);
    } else if (msg.event === "stop") {
      this.close();
    }
  }

  async close(): Promise<void> {
    const ms = Date.now() - this.startedAt;
    log.info({ callId: this.cfg.callId, ms }, "session closed");
    await this.cfg.provider.close();
    if (this.socket.readyState === this.socket.OPEN) this.socket.close();
  }
}
