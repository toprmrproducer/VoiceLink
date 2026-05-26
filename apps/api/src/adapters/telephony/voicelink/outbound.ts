/**
 * Voicelink outbound dialer — wraps POST /v1/add_lead.
 *
 * NOT YET tested against the real Voicelink staging because the reseller
 * API token (Q3) is unresolved. The request shape matches the OpenAPI
 * AddLeadRequest schema verbatim.
 */

import type { CallHandle, OutboundCallInput } from "../types.js";
import type { VoicelinkClient } from "./client.js";

interface AddLeadRequest {
  did_number: string;
  customer_number: string;
  country_code?: string;
  custom_parameters?: string;
  websocket_url?: string;
  webhook_url?: string;
  call_limit?: number;
}

interface AddLeadResponse {
  /** Voicelink's stable id for this call. */
  unique_id?: string;
  /** Some endpoints return `call_id` instead. */
  call_id?: string;
  /** Generic data envelope; some Voicelink endpoints wrap responses. */
  data?: { unique_id?: string; call_id?: string };
}

export async function originateCall(
  client: VoicelinkClient,
  input: OutboundCallInput,
): Promise<CallHandle> {
  const body: AddLeadRequest = {
    did_number: input.fromDid,
    customer_number: input.toNumber,
  };
  if (input.countryCode !== undefined) body.country_code = input.countryCode;
  if (input.customParameters !== undefined)
    body.custom_parameters = input.customParameters;
  if (input.websocketUrl !== undefined) body.websocket_url = input.websocketUrl;
  if (input.webhookUrl !== undefined) body.webhook_url = input.webhookUrl;
  if (input.callLimit !== undefined) body.call_limit = input.callLimit;

  const res = await client.request<AddLeadResponse>("POST", "/v1/add_lead", body);
  const providerCallId =
    res.unique_id ??
    res.call_id ??
    res.data?.unique_id ??
    res.data?.call_id;
  if (!providerCallId) {
    throw new Error(
      `add_lead succeeded but no unique_id/call_id in response: ${JSON.stringify(res)}`,
    );
  }
  return { providerCallId, acceptedAt: new Date() };
}
