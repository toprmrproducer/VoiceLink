import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";

import {
  AssignDidInput,
  CreateTenantInput,
  type Did,
  type Tenant,
} from "@voiceplatform/shared";

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

// ───────────────────────── DIDs ─────────────────────────

adminRouter.get("/dids", async (req: Request, res: Response) => {
  const tenantId =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const provider =
    typeof req.query.provider === "string" ? req.query.provider : undefined;
  const filter: Record<string, string> = {};
  if (tenantId) filter.tenantId = tenantId;
  if (provider) filter.provider = provider;

  const dids = await getDb()
    .collection<Did>("dids")
    .find(filter)
    .sort({ assignedAt: -1 })
    .toArray();
  res.json({
    dids: dids.map((d) => ({ ...d, _id: String(d._id) })),
  });
});

adminRouter.post("/dids/assign", async (req: Request, res: Response) => {
  const parsed = AssignDidInput.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const {
    tenantId,
    provider,
    providerNumber,
    didType,
    defaultAgentId,
  } = parsed.data;

  const db = getDb();

  // 1. Verify target tenant exists.
  const tenant = await db
    .collection<Tenant>("tenants")
    .findOne({ _id: tenantId });
  if (!tenant) {
    res.status(404).json({ error: "tenant not found" });
    return;
  }

  // 2. Look up an existing assignment for this number (across all tenants).
  const dids = db.collection<Did>("dids");
  const existing = await dids.findOne({ providerNumber });
  const now = new Date();

  if (existing) {
    if (existing.tenantId !== tenantId) {
      res.status(409).json({
        error: "DID already linked to another tenant",
        tenantId: existing.tenantId,
      });
      return;
    }
    // Idempotent same-tenant re-assign: update mutable fields + log.
    const patch: Partial<Did> = { updatedAt: now };
    if (didType !== undefined) patch.didType = didType;
    if (defaultAgentId !== undefined) patch.defaultAgentId = defaultAgentId;
    await dids.updateOne({ _id: existing._id }, { $set: patch });
    await db.collection("did_logs").insertOne({
      providerNumber,
      tenantId,
      action: "reassign",
      at: now,
    });
    const after = await dids.findOne({ _id: existing._id });
    await backfillPendingCalls(providerNumber, tenantId, defaultAgentId);
    res.status(200).json({
      did: after ? { ...after, _id: String(after._id) } : null,
    });
    return;
  }

  // 3. Net-new DID assignment.
  const newDid: Did = {
    _id: new ObjectId().toString(),
    tenantId,
    provider,
    providerNumber,
    didType: didType ?? "unknown",
    status: "active",
    assignedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  if (defaultAgentId !== undefined) newDid.defaultAgentId = defaultAgentId;
  await dids.insertOne(newDid);
  await db.collection("did_logs").insertOne({
    providerNumber,
    tenantId,
    action: "assign",
    at: now,
  });
  const backfilled = await backfillPendingCalls(
    providerNumber,
    tenantId,
    defaultAgentId,
  );
  log.info(
    { tenantId, providerNumber, provider, backfilled },
    "DID assigned",
  );
  res
    .status(201)
    .json({ did: { ...newDid, _id: String(newDid._id) }, backfilled });
});

/**
 * Update any pre-existing "pending" call rows whose virtual_number matches
 * this DID. tenantId is always set; agentId is updated ONLY when a default
 * was supplied (otherwise pending until the call has explicit agent context).
 */
async function backfillPendingCalls(
  providerNumber: string,
  tenantId: string,
  defaultAgentId: string | undefined,
): Promise<number> {
  const calls = getDb().collection("calls");
  const set: Record<string, unknown> = { tenantId, updatedAt: new Date() };
  if (defaultAgentId !== undefined) set.agentId = defaultAgentId;
  const result = await calls.updateMany(
    {
      tenantId: "pending",
      $or: [
        { fromNumber: providerNumber },
        { toNumber: providerNumber },
      ],
    },
    { $set: set },
  );
  return result.modifiedCount;
}
