import type { Result } from "@repo/core";
import { z } from "zod";
import { inngest } from "./client";

export const syncEventNames = {
  approval_state_reconciliation: "reconcile-xero-approval-state",
  leave_balances: "sync-xero-leave-balances",
  leave_records: "sync-xero-leave-records",
  people: "sync-xero-people",
} as const;

export type RegisteredSyncRunType = keyof typeof syncEventNames;

const registeredHandlers = new Set<RegisteredSyncRunType>([
  "approval_state_reconciliation",
  "leave_balances",
  "leave_records",
  "people",
]);

const SyncEventSchema = z.object({
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  runType: z.enum([
    "people",
    "leave_records",
    "leave_balances",
    "approval_state_reconciliation",
  ]),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  xeroTenantId: z.string().uuid(),
});

const CancelSyncEventSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  runId: z.string().uuid(),
});

export function getRegisteredSyncEventName(
  runType: RegisteredSyncRunType
): string | null {
  return registeredHandlers.has(runType) ? syncEventNames[runType] : null;
}

export function getUtcCadenceSlot(
  runType: RegisteredSyncRunType,
  date: Date = new Date()
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");

  if (runType === "approval_state_reconciliation") {
    return `${year}-${month}-${day}Z`;
  }
  if (runType === "leave_balances") {
    return `${year}-${month}-${day}T${hour}:00Z`;
  }
  // 15-minute cadence for people & leave_records
  const minutes = date.getUTCMinutes();
  const slotMinutes = String(Math.floor(minutes / 15) * 15).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${slotMinutes}Z`;
}

export function getScheduledSyncEventId(
  xeroTenantId: string,
  runType: RegisteredSyncRunType,
  date: Date = new Date()
): string {
  const slot = getUtcCadenceSlot(runType, date);
  return `scheduled-sync:${xeroTenantId}:${runType}:${slot}`;
}

export interface DispatchSyncEventOptions {
  eventId?: string;
}

export async function dispatchSyncEvent(
  input: z.input<typeof SyncEventSchema>,
  options?: DispatchSyncEventOptions
): Promise<
  Result<
    { eventName: string; ids: string[]; queued: true },
    {
      code: "dispatch_failed" | "dispatch_not_wired" | "validation_error";
      message: string;
    }
  >
> {
  const parsed = SyncEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid sync event.",
      },
      ok: false,
    };
  }
  const eventName = getRegisteredSyncEventName(parsed.data.runType);
  if (!eventName) {
    return {
      error: {
        code: "dispatch_not_wired",
        message: "This sync job is not registered yet.",
      },
      ok: false,
    };
  }

  try {
    const payload: {
      name: string;
      data: {
        bindingGeneration: number;
        clerkOrgId: string;
        organisationId: string;
        personId?: string;
        triggeredByUserId: string | null;
        triggerType: "scheduled" | "manual" | "webhook";
        xeroTenantId: string;
      };
      id?: string;
    } = {
      data: {
        bindingGeneration: parsed.data.bindingGeneration,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        personId: parsed.data.personId,
        triggeredByUserId: parsed.data.triggeredByUserId ?? null,
        triggerType: parsed.data.triggerType,
        xeroTenantId: parsed.data.xeroTenantId,
      },
      name: eventName,
    };

    if (options?.eventId) {
      payload.id = options.eventId;
    }

    const sent = await inngest.send(payload);
    return { ok: true, value: { eventName, ids: sent.ids, queued: true } };
  } catch {
    return {
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the sync job.",
      },
      ok: false,
    };
  }
}

export async function dispatchCancelSyncRun(
  input: z.input<typeof CancelSyncEventSchema>
): Promise<
  Result<
    { queued: true },
    { code: "dispatch_failed" | "validation_error"; message: string }
  >
> {
  const parsed = CancelSyncEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid sync cancellation event.",
      },
      ok: false,
    };
  }

  try {
    await inngest.send({
      data: parsed.data,
      name: "cancel-sync-run",
    });
    return { ok: true, value: { queued: true } };
  } catch {
    return {
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the cancellation event.",
      },
      ok: false,
    };
  }
}
