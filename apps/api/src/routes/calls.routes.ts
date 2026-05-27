import { Router, type Request, type Response } from "express";

import type { Call } from "@voiceplatform/shared";

import { getDb } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, tenantScope } from "../middleware/tenant.js";

export const callsRouter = Router();

callsRouter.use(requireAuth, requireTenant);

/**
 * GET /calls — paginated list of calls for the caller's tenant.
 *
 * Query params:
 *   - limit (default 50, max 200)
 *   - status (filter by Call.status)
 *   - direction ("in" | "out")
 *   - agentId
 *   - campaignId
 *   - before (ISO date) — return calls created strictly before this timestamp
 *
 * Newest first. Cursor pagination uses `before=<createdAt>` of the last
 * row in the previous page.
 */
callsRouter.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const filter: Record<string, unknown> = {};
  for (const key of ["status", "direction", "agentId", "campaignId"] as const) {
    const v = req.query[key];
    if (typeof v === "string" && v.length > 0) filter[key] = v;
  }
  const before = req.query.before;
  if (typeof before === "string") {
    const parsed = new Date(before);
    if (Number.isFinite(parsed.getTime())) {
      filter.createdAt = { $lt: parsed };
    }
  }

  const list = await getDb()
    .collection<Call>("calls")
    .find(tenantScope(req, filter))
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  res.json({ calls: list });
});

callsRouter.get("/:id", async (req: Request, res: Response) => {
  const call = await getDb()
    .collection<Call>("calls")
    .findOne(tenantScope(req, { _id: req.params.id }));
  if (!call) {
    res.status(404).end();
    return;
  }
  res.json(call);
});
