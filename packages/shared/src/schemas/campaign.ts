import { z } from "zod";

export const CampaignStatus = z.enum(["draft", "running", "paused", "done"]);

export const CampaignSchedule = z.object({
  startAt: z.coerce.date(),
  timezone: z.string().default("Asia/Kolkata"),
  pacingCallsPerMinute: z.number().int().min(1).max(600).default(10),
  retries: z.number().int().min(0).max(10).default(0),
});

export const CampaignNumber = z.object({
  phone: z.string().min(7).max(20),
  customData: z.record(z.unknown()).default({}),
});

export const CampaignStats = z.object({
  total: z.number().int().nonnegative().default(0),
  dialed: z.number().int().nonnegative().default(0),
  connected: z.number().int().nonnegative().default(0),
  succeeded: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
});

export const Campaign = z.object({
  _id: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  name: z.string().min(1).max(120),
  csvImportRef: z.string().optional(),
  schedule: CampaignSchedule,
  numbers: z.array(CampaignNumber).default([]),
  status: CampaignStatus.default("draft"),
  stats: CampaignStats.default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCampaignInput = Campaign.omit({
  _id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  stats: true,
}).partial({ csvImportRef: true, numbers: true, status: true });

export const UpdateCampaignInput = CreateCampaignInput.partial();

export type CampaignStatus = z.infer<typeof CampaignStatus>;
export type CampaignSchedule = z.infer<typeof CampaignSchedule>;
export type CampaignNumber = z.infer<typeof CampaignNumber>;
export type CampaignStats = z.infer<typeof CampaignStats>;
export type Campaign = z.infer<typeof Campaign>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignInput>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignInput>;
