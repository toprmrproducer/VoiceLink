import express, { type Express } from "express";
import cors from "cors";

import { authRouter } from "./routes/auth.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { agentsRouter } from "./routes/agents.routes.js";
import { campaignsRouter } from "./routes/campaigns.routes.js";
import { flowsRouter } from "./routes/flows.routes.js";
import { voiceClonesRouter } from "./routes/voice-clones.routes.js";
import { voicesRouter } from "./routes/voices.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.use("/agents", agentsRouter);
  app.use("/campaigns", campaignsRouter);
  app.use("/flows", flowsRouter);
  app.use("/voice-clones", voiceClonesRouter);
  app.use("/voices", voicesRouter);
  app.use("/webhooks", webhooksRouter);

  return app;
}
