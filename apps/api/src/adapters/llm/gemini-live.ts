import type { RealtimeProvider, RealtimeProviderConfig } from "./types.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("gemini-live");

// Skeleton for Google's Gemini Live API. Same shape as OpenAI Realtime
// so the session-manager can swap them via Agent.llm.realtimeModel.
// Real wiring (model: gemini-live-2.0, BidiGenerateContent stream, audio
// in/out shapes) lands when GEMINI_API_KEY is in prod env.
export class GeminiLiveProvider implements RealtimeProvider {
  private audioHandlers: ((frame: Buffer) => void)[] = [];
  private textHandlers: ((delta: string) => void)[] = [];
  private turnEndHandlers: (() => void)[] = [];
  private errorHandlers: ((err: Error) => void)[] = [];

  constructor(private cfg: RealtimeProviderConfig) {}

  async connect(): Promise<void> {
    log.warn({ model: this.cfg.model }, "gemini-live connect: not yet implemented");
    throw new Error("GeminiLiveProvider.connect is not implemented yet");
  }

  sendAudio(_frame: Buffer): void {
    throw new Error("not implemented");
  }
  sendText(_text: string): void {
    throw new Error("not implemented");
  }

  onAudio(h: (frame: Buffer) => void) { this.audioHandlers.push(h); }
  onText(h: (delta: string) => void) { this.textHandlers.push(h); }
  onTurnEnd(h: () => void) { this.turnEndHandlers.push(h); }
  onError(h: (err: Error) => void) { this.errorHandlers.push(h); }

  async close(): Promise<void> {
    /* noop */
  }
}
