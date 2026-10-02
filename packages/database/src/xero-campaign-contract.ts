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
  bindingState: z.enum(["active", "retired"]).optional(),
  credentialOwnerId: z.uuid().nullable(),
  externalTenantId: z.uuid(),
  providerAppId: z.string().min(1),
  xeroTenantId: z.uuid().nullable(),
}).strict();
export const XeroCampaignProviderRequestSchema = z.strictObject({
  bodyHash: reference.nullable(),
  maxAttempts: z.number().int().positive().max(4),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  url: z.url(),
});
export type XeroCampaignProviderRequest = z.infer<
  typeof XeroCampaignProviderRequestSchema
>;
export const XeroCampaignTicketSchema = z.strictObject({
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  dispatchId: z.uuid(),
  eventIds: z.array(z.string().min(1)).max(10),
  functionId: z.string().min(1).max(100),
  organisationId: z.uuid(),
  outcome: z.enum(["reserved", "running", "succeeded", "failed"]),
  providerRequests: z
    .array(XeroCampaignProviderRequestSchema)
    .max(20)
    .optional(),
  scheduledSlot: z.string().nullable(),
  schedulerRunId: z.string().nullable(),
  targetHash: reference.nullable(),
  userId: z.string().nullable(),
  workerRunId: z.string().nullable(),
});
export const XeroCampaignControlSchema = z.strictObject({
  allowedFunctions: z.array(z.string().min(1).max(100)).min(1).max(40),
  bindingTransitions: z
    .array(
      z.strictObject({
        dispatchId: z.uuid(),
        next: XeroCampaignResourceSchema,
        observedAt: z.iso.datetime(),
        previous: XeroCampaignResourceSchema,
      })
    )
    .max(100)
    .optional(),
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
        providerDispatch: z.boolean().optional(),
        providerRequest: z.string().nullable().optional(),
        providerResponseStatus: z
          .number()
          .int()
          .min(100)
          .max(599)
          .nullable()
          .optional(),
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

function canonicalActionTarget(value: z.core.util.JSONType): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalActionTarget).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalActionTarget(value[key])}`)
    .join(",")}}`;
}

/** Hash only the server-validated action input and authenticated actor. */
export function xeroCampaignActionTargetHash(input: {
  functionId: string;
  clerkOrgId: string;
  organisationId: string;
  userId: string;
  target: unknown;
}) {
  return `sha256:${createHash("sha256")
    .update(canonicalActionTarget(z.json().parse(input)))
    .digest("hex")}`;
}
