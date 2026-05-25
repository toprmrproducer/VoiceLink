import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";

import { CreateTenantInput, type Tenant } from "@voiceplatform/shared";

import { getDb } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperadmin } from "../middleware/superadmin.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("admin");
export const adminRouter = Router();

adminRouter.use(requireAuth, requireSuperadmin);

adminRouter.get("/tenants", async (_req: Request, res: Response) => {
  const tenants = await getDb()
    .collection<Tenant>("tenants")
    .find({}, { projection: { byok: 0 } })
    .toArray();
  res.json({ tenants: tenants.map((t) => ({ ...t, _id: String(t._id) })) });
});

adminRouter.post("/tenants/link", async (req: Request, res: Response) => {
  const parsed = CreateTenantInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const { name, voicelinkClientId } = parsed.data;
  const tenants = getDb().collection<Tenant>("tenants");

  const existing = await tenants.findOne({
    "telephony.providerClientId": voicelinkClientId,
  });
  if (existing) {
    res.status(409).json({
      error: "voicelinkClientId already linked",
      tenantId: String(existing._id),
    });
    return;
  }

  const now = new Date();
  const id = new ObjectId().toString();
  const tenant: Tenant = {
    _id: id,
    name,
    plan: "starter",
    status: "active",
    telephony: {
      provider: "voicelink",
      providerClientId: voicelinkClientId,
      walletThresholdNotify: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  await tenants.insertOne(tenant);
  log.info({ tenantId: id, voicelinkClientId }, "tenant linked");
  res.status(201).json(tenant);
});
