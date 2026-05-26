import { createApp } from "./server.js";
import { connectDb } from "./db/connection.js";
import { startDialWorker, stopDialWorker } from "./campaign-engine/queue.js";
import { createLogger } from "./lib/logger.js";

const log = createLogger("main");

async function start(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error("MONGO_URL env var is required");
  await connectDb(mongoUrl);

  // Optional — only starts if REDIS_URL is set. Dev mode without Redis
  // uses /campaigns/:id/dial-now for single-shot dials.
  const worker = startDialWorker();
  if (worker) {
    log.info("campaign dial worker started");
  } else {
    log.warn("REDIS_URL not set — campaign dial worker NOT started");
  }

  const port = Number(process.env.PORT ?? 4000);
  const app = createApp();
  const server = app.listen(port, () =>
    log.info({ port }, "@voiceplatform/api listening"),
  );

  // Graceful shutdown so BullMQ flushes in-flight jobs before exit.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, async () => {
      log.info({ sig }, "shutting down");
      server.close();
      await stopDialWorker();
      process.exit(0);
    });
  }
}

start().catch((err) => {
  log.error({ err }, "fatal startup error");
  process.exit(1);
});
