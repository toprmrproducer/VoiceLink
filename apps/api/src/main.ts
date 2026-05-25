import { createApp } from "./server.js";
import { connectDb } from "./db/connection.js";
import { createLogger } from "./lib/logger.js";

const log = createLogger("main");

async function start(): Promise<void> {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error("MONGO_URL env var is required");
  await connectDb(mongoUrl);

  const port = Number(process.env.PORT ?? 4000);
  const app = createApp();
  app.listen(port, () => log.info({ port }, "@voiceplatform/api listening"));
}

start().catch((err) => {
  log.error({ err }, "fatal startup error");
  process.exit(1);
});
