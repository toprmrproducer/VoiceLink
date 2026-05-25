import express, { type Express } from "express";
import cors from "cors";

import { authRouter } from "./routes/auth.routes.js";
import { adminRouter } from "./routes/admin.routes.js";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);

  return app;
}
