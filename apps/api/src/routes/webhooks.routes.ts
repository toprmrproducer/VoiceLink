import { Router } from "express";
import {
  VoicelinkCallEvent,
  voicelinkToCallStatus,
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

  // 2. Upsert canonical call row
  const callDoc = buildCallDoc(event, now);
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
    },
    "voicelink webhook received",
  );

  res.status(200).json({ received: true });
});

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
    /** Pending tenant resolution — see TODO below. */
    tenantId: string;
    /** Pending agent resolution — set when the call was originated. */
    agentId: string;
    createdAt: Date;
    sentiment: "unknown";
    costCredits: number;
    costCogs: number;
  };
}

function buildCallDoc(
  event: VoicelinkCallEventType,
  now: Date,
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

  return {
    set,
    setOnInsert: {
      providerCallId: event.unique_id,
      // TODO(s1-followup): resolve tenant from `virtual_number` (DID lookup)
      // or from `custom_parameters` (set during outbound originate). Until
      // then, calls land with tenantId="pending" and are reconciled later.
      tenantId: "pending",
      // TODO(s1-followup): resolve agentId — set during originate via
      // custom_parameters round-trip; for inbound, look up the agent
      // assigned to the DID.
      agentId: "pending",
      createdAt: now,
      sentiment: "unknown",
      costCredits: 0,
      costCogs: 0,
    },
  };
}

function parseCallDate(s: string): Date | undefined {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}
