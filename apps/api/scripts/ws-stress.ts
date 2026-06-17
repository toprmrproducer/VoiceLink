/**
 * Sustained WS stress test: open the bot socket, send start, stream 20s of
 * silence frames (like a live caller), and log exactly when/if it closes +
 * the close code. Run against localhost vs the tunnel to isolate the drop.
 *   npx tsx scripts/ws-stress.ts <didId> <wsBase>
 */
import WebSocket from "ws";

const didId = process.argv[2] || "919484956633";
const wsBase = process.argv[3] || "ws://localhost:4000";
const url = `${wsBase}/ws/voicelink/${didId}`;
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(2) + "s";

const resolveIp = process.env.RESOLVE_IP;
const wsOpts = resolveIp
  ? { lookup: (_h: string, _o: unknown, cb: (e: null, a: string, f: number) => void) => cb(null, resolveIp, 4) }
  : {};
const ws = new WebSocket(url, wsOpts as any);
let agentFrames = 0;
let lastAgentAt = 0;

ws.on("open", () => {
  console.log(`[${el()}] OPEN ${url}`);
  ws.send(JSON.stringify({
    event: "start",
    sequence_number: 0,
    stream_sid: "stress-stream",
    start: {
      call_sid: "stress-call", stream_sid: "stress-stream",
      media_format: { encoding: "audio/alaw", sample_rate: "8000" },
      custom_parameters: { from: "+910000000000" },
    },
  }));
  let n = 0;
  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN || n >= 1000) { clearInterval(timer); return; } // 20s @ 20ms
    // a-law silence byte is 0xD5
    ws.send(JSON.stringify({ event: "media", media: { payload: Buffer.alloc(160, 0xd5).toString("base64") } }));
    n++;
  }, 20);
});

ws.on("message", (raw) => {
  try {
    const m = JSON.parse(raw.toString());
    if (m.event === "media" && m.media?.payload) { agentFrames++; lastAgentAt = Date.now() - t0; }
  } catch { /* ignore */ }
});
ws.on("error", (e) => console.log(`[${el()}] WS ERROR: ${(e as Error).message}`));
ws.on("close", (code, reason) => {
  console.log(`[${el()}] WS CLOSE code=${code} reason="${reason?.toString()}" agentFrames=${agentFrames} lastAgentFrameAt=${(lastAgentAt/1000).toFixed(2)}s`);
  process.exit(0);
});

setTimeout(() => {
  console.log(`[${el()}] DONE (held 22s) agentFrames=${agentFrames}`);
  ws.close();
  process.exit(0);
}, 22000);
