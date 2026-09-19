import { createHash } from "node:crypto";
import { z } from "zod";

export const ACTIVATION_EVENT_VERSION = 1 as const;

export const activationEventNames = [
  "Application Accepted",
  "Customer Admitted",
  "Organisation Provisioned",
  "Xero Connected",
  "Initial Sync Completed",
  "First Feed Accessed",
  "First Leave Submitted",
  "First Leave Approved",
] as const;

export type ActivationEventName = (typeof activationEventNames)[number];

const ActivationEventSchema = z.object({
  deduplicationKey: z.string().min(1).max(200),
  name: z.enum(activationEventNames),
  occurredAt: z.coerce.date(),
  subjectId: z.string().min(1).max(200),
  version: z.literal(ACTIVATION_EVENT_VERSION),
});

export interface ActivationEvent {
  distinctId: string;
  event: ActivationEventName;
  properties: {
    event_id: string;
    event_version: typeof ACTIVATION_EVENT_VERSION;
  };
  timestamp: Date;
  uuid: string;
}

const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const stableUuid = (value: string) => {
  const hex = stableId(value).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = (8 + (Number.parseInt(hex[16] ?? "0", 16) % 4)).toString(16);
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
};

export const createActivationEvent = (input: {
  deduplicationKey: string;
  name: ActivationEventName;
  occurredAt: Date | string;
  subjectId: string;
}): ActivationEvent => {
  const parsed = ActivationEventSchema.parse({
    ...input,
    version: ACTIVATION_EVENT_VERSION,
  });
  const eventId = stableUuid(
    `team-calendar:activation:${parsed.version}:${parsed.name}:${parsed.deduplicationKey}`
  );
  return {
    distinctId: stableId(`team-calendar:subject:${parsed.subjectId}`),
    event: parsed.name,
    properties: { event_id: eventId, event_version: parsed.version },
    timestamp: parsed.occurredAt,
    uuid: eventId,
  };
};

export const activationEventPropertyAllowlist = [
  "event_id",
  "event_version",
] as const;
