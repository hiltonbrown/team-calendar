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
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  runType: z.enum([
    "people",
    "leave_records",
    "leave_balances",
    "approval_state_reconciliation",
  ]),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  triggeredByUserId: z.string().min(1).nullable().optional(),
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

export async function dispatchSyncEvent(
  input: z.input<typeof SyncEventSchema>
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
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid sync event.",
      },
    };
  }
  const eventName = getRegisteredSyncEventName(parsed.data.runType);
  if (!eventName) {
    return {
      ok: false,
      error: {
        code: "dispatch_not_wired",
        message: "This sync job is not registered yet.",
      },
    };
  }

  try {
    const sent = await inngest.send({
      name: eventName,
      data: {
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        personId: parsed.data.personId,
        triggerType: parsed.data.triggerType,
        triggeredByUserId: parsed.data.triggeredByUserId ?? null,
        xeroTenantId: parsed.data.xeroTenantId,
      },
    });
    return { ok: true, value: { eventName, ids: sent.ids, queued: true } };
  } catch {
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the sync job.",
      },
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
      ok: false,
      error: {
        code: "validation_error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid sync cancellation event.",
      },
    };
  }

  try {
    await inngest.send({
      name: "cancel-sync-run",
      data: parsed.data,
    });
    return { ok: true, value: { queued: true } };
  } catch {
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the cancellation event.",
      },
    };
  }
}
