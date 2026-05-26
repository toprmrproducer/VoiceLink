import { Router } from "express";
import {
  VoicelinkCallEvent,
  voicelinkToCallStatus,
  type Did,
  type VoicelinkCallEvent as VoicelinkCallEventType,
} from "@voiceplatform/shared";

import { getDb } from "../db/connection.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("webhooks");

export const webhooksRouter = Router();

/**
 * POST /webhooks/voicelink
 *
 * Voicelink fires this for every configured call event (Event Type =
 * ringing | answered | completed | failed). The reseller maps the field
 * names in the "Add Call Event API" admin UI — see Architecture.md §2.
 *
 * v1 behavior:
 *   1. Validate the payload against the canonical schema.
 *   2. Append the raw payload to `call_events` (audit trail).
 *   3. Upsert the `calls` row keyed by providerCallId.
 *   4. Return { received: true } so Voicelink stops retrying.
 *
 * Signature verification (Q2) is not yet wired — see verifyWebhook in the
 * TelephonyProvider interface. Mitigation until then: gate this path via
 * IP allow-list at Caddy.
 */
webhooksRouter.post("/voicelink", async (req, res) => {
  const raw = req.body;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    res.status(400).json({ error: "body must be a JSON object" });
    return;
  }
  const parsed = VoicelinkCallEvent.safeParse(raw);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "invalid payload", issues: parsed.error.issues });
    return;
  }

  const event = parsed.data;
  const now = new Date();
  const db = getDb();

  // 1. Append raw event (audit trail, never updated)
  await db.collection("call_events").insertOne({
    providerCallId: event.unique_id,
    eventType: event.event_type,
    callStatus: event.status,
    receivedAt: now,
    rawPayload: raw as Record<string, unknown>,
  });

  // 2. Resolve tenant + agent via DID lookup + custom_parameters parse.
  const did = await db
    .collection<Did>("dids")
    .findOne({ providerNumber: event.virtual_number });
  const customParams = parseCustomParameters(
    (raw as Record<string, unknown>).custom_parameters,
  );
  const resolvedTenantId = did?.tenantId ?? "pending";
  const resolvedAgentId =
    customParams.agentId ?? did?.defaultAgentId ?? "pending";

  // 3. Upsert canonical call row
  const callDoc = buildCallDoc(event, now, {
    tenantId: resolvedTenantId,
    agentId: resolvedAgentId,
    campaignId: customParams.campaignId,
  });
  await db.collection("calls").updateOne(
    { providerCallId: event.unique_id },
    {
      $set: callDoc.set,
      $setOnInsert: callDoc.setOnInsert,
    },
    { upsert: true },
  );

  log.info(
    {
      providerCallId: event.unique_id,
      eventType: event.event_type,
      status: callDoc.set.status,
      tenantId: resolvedTenantId,
      agentId: resolvedAgentId,
      didResolved: did !== null,
    },
    "voicelink webhook received",
  );

  res.status(200).json({ received: true });
});

interface ResolvedContext {
  tenantId: string;
  agentId: string;
  campaignId?: string;
}

interface CallDocPatch {
  set: {
    direction: "in" | "out";
    fromNumber: string;
    toNumber: string;
    status: "queued" | "ringing" | "inprogress" | "completed" | "failed";
    durationSec: number;
    recordingUrl?: string;
    startedAt?: Date;
    endedAt?: Date;
    updatedAt: Date;
  };
  setOnInsert: {
    providerCallId: string;
    tenantId: string;
    agentId: string;
    campaignId?: string;
    createdAt: Date;
    sentiment: "unknown";
    costCredits: number;
    costCogs: number;
  };
}

function buildCallDoc(
  event: VoicelinkCallEventType,
  now: Date,
  ctx: ResolvedContext,
): CallDocPatch {
  const direction: "in" | "out" =
    event.call_type === "outbound" ? "out" : "in";

  // For outbound calls: we dialed from our DID (virtual_number) → customer.
  // For inbound calls: customer dialed our DID, so the "from" is them.
  const fromNumber =
    direction === "out" ? event.virtual_number : event.customer_number;
  const toNumber =
    direction === "out" ? event.customer_number : event.virtual_number;

  const status = voicelinkToCallStatus(event.event_type, event.status);
  const startedAt = parseCallDate(event.call_date);
  const durationSec = event.duration ?? 0;
  const isTerminal = status === "completed" || status === "failed";
  const endedAt =
    isTerminal && startedAt ? new Date(startedAt.getTime() + durationSec * 1000) : undefined;

  const set: CallDocPatch["set"] = {
    direction,
    fromNumber,
    toNumber,
    status,
    durationSec,
    updatedAt: now,
  };
  if (event.recording_path !== undefined) {
    set.recordingUrl = event.recording_path;
  }
  if (startedAt !== undefined) {
    set.startedAt = startedAt;
  }
  if (endedAt !== undefined) {
    set.endedAt = endedAt;
  }

  const setOnInsert: CallDocPatch["setOnInsert"] = {
    providerCallId: event.unique_id,
    tenantId: ctx.tenantId,
    agentId: ctx.agentId,
    createdAt: now,
    sentiment: "unknown",
    costCredits: 0,
    costCogs: 0,
  };
  if (ctx.campaignId !== undefined) {
    setOnInsert.campaignId = ctx.campaignId;
  }

  return { set, setOnInsert };
}

function parseCallDate(s: string): Date | undefined {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Parse the `custom_parameters` field from a Voicelink call-event payload.
 *
 * Convention: our campaign engine (P2-B) encodes per-call context as JSON
 * when calling `originateCall`. The reseller (Hardik) maps the
 * `custom_parameters` slot in the Voicelink webhook configurator so it
 * round-trips back to us. Unparseable strings are silently ignored — the
 * caller falls back to DID defaults.
 */
function parseCustomParameters(value: unknown): {
  agentId?: string;
  campaignId?: string;
} {
  if (typeof value !== "string" || value.length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: { agentId?: string; campaignId?: string } = {};
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.agentId === "string" && obj.agentId.length > 0) {
      out.agentId = obj.agentId;
    }
    if (typeof obj.campaignId === "string" && obj.campaignId.length > 0) {
      out.campaignId = obj.campaignId;
    }
    return out;
  } catch {
    return {};
  }
}
