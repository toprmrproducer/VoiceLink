import express, { type Express } from "express";
import cors from "cors";
import { createLogger } from "./lib/logger.js";

const log = createLogger("server");

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  const app = createApp();
  app.listen(port, () => log.info({ port }, "@voiceplatform/api listening"));
}
