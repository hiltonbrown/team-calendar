import { createHash } from "node:crypto";
import { z } from "zod";

const reference = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const XeroCampaignEventSchema = z.strictObject({
  dispatchId: z.uuid(),
  epoch: z.number().int().positive(),
  runId: z.uuid(),
});
export type XeroCampaignEvent = z.infer<typeof XeroCampaignEventSchema>;
export const XeroCampaignScopeSchema = z.object({
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  organisationId: z.uuid(),
  xeroTenantId: z.uuid().nullable().optional(),
});
export type XeroCampaignScope = z.infer<typeof XeroCampaignScopeSchema>;
export const XeroCampaignResourceSchema = XeroCampaignScopeSchema.extend({
  credentialOwnerId: z.uuid().nullable(),
  externalTenantId: z.uuid(),
  providerAppId: z.string().min(1),
  xeroTenantId: z.uuid().nullable(),
}).strict();
export const XeroCampaignTicketSchema = z.strictObject({
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  dispatchId: z.uuid(),
  eventIds: z.array(z.string().min(1)).max(10),
  functionId: z.string().min(1).max(100),
  organisationId: z.uuid(),
  outcome: z.enum(["reserved", "running", "succeeded", "failed"]),
  scheduledSlot: z.string().nullable(),
  schedulerRunId: z.string().nullable(),
  targetHash: reference.nullable(),
  userId: z.string().nullable(),
  workerRunId: z.string().nullable(),
});
export const XeroCampaignControlSchema = z.strictObject({
  allowedFunctions: z.array(z.string().min(1).max(100)).min(1).max(40),
  candidateSha: sha,
  closure: z
    .strictObject({
      cleanupReference: reference,
      restorationReference: reference,
      workerDrainReference: reference,
      writerClosureReference: reference,
    })
    .nullable()
    .default(null),
  credentialDomainId: z.uuid(),
  databaseRunId: z.uuid(),
  databaseTargetHash: reference,
  effects: z
    .array(
      z.strictObject({
        dispatchId: z.uuid(),
        id: z.uuid(),
        outcome: z.enum(["dispatched", "completed", "uncertain"]),
      })
    )
    .max(2000)
    .default([]),
  epoch: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum(["acquiring", "active", "draining", "recovering", "closed"]),
  registrationObservedAt: z.iso.datetime(),
  registrationReference: reference,
  resources: z.array(XeroCampaignResourceSchema).min(1).max(20),
  runId: z.uuid(),
  sanctionedActors: z
    .array(
      z.strictObject({
        actions: z.array(z.string().min(1).max(100)).min(1).max(30),
        clerkOrgId: z.string().min(1),
        organisationId: z.uuid(),
        userId: z.string().min(1),
      })
    )
    .max(40),
  tickets: z.array(XeroCampaignTicketSchema).max(500),
  version: z.literal(1),
});
export type XeroCampaignControl = z.infer<typeof XeroCampaignControlSchema>;
export type XeroCampaignTicket = z.infer<typeof XeroCampaignTicketSchema>;
export const XeroCampaignSentinelSchema = z.strictObject({
  credentialDomainId: z.uuid(),
  databaseTargetHash: reference,
  version: z.literal(1),
});
export type XeroCampaignSentinel = z.infer<typeof XeroCampaignSentinelSchema>;

export function xeroCampaignTargetHash(target: {
  branchId: string;
  database: string;
  endpointId: string;
  hostname: string;
  projectId: string;
  role: string;
}) {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify([
        target.projectId,
        target.branchId,
        target.endpointId,
        target.hostname,
        target.database,
        target.role,
      ])
    )
    .digest("hex")}`;
}
export class XeroCampaignDeniedError extends Error {
  constructor() {
    super("xero_campaign_admission_denied");
  }
}
