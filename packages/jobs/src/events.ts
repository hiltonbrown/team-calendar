import { randomUUID } from "node:crypto";
import type { Result } from "@repo/core";
import { ensureXeroInitialSyncRequested } from "@repo/database/queries/xero-sync-cursors";
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
  connectionId: z.string().uuid(),
  mode: z.enum(["full", "incremental"]).optional(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  runType: z.enum([
    "people",
    "leave_records",
    "leave_balances",
    "approval_state_reconciliation",
  ]),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
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
  connectionId: string,
  runType: RegisteredSyncRunType,
  date: Date = new Date()
): string {
  const slot = getUtcCadenceSlot(runType, date);
  return `scheduled-sync:${connectionId}:${runType}:${slot}`;
}
export interface DispatchSyncEventOptions {
  eventId?: string;
}
export async function dispatchSyncEvent(
  input: z.input<typeof SyncEventSchema>,
  options?: DispatchSyncEventOptions
): Promise<
  Result<
    {
      eventName: string;
      ids: string[];
      queued: true;
    },
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
    const runId = parsed.data.runId ?? randomUUID();
    const payload: {
      name: string;
      data: {
        clerkOrgId: string;
        organisationId: string;
        mode?: "full" | "incremental";
        personId?: string;
        runId: string;
        triggeredByUserId: string | null;
        triggerType: "scheduled" | "manual" | "webhook";
        connectionId: string;
      };
      id?: string;
    } = {
      data: {
        clerkOrgId: parsed.data.clerkOrgId,
        connectionId: parsed.data.connectionId,
        organisationId: parsed.data.organisationId,
        ...(["people", "leave_records"].includes(parsed.data.runType)
          ? {
              mode:
                parsed.data.mode ??
                (parsed.data.triggerType === "scheduled"
                  ? ("incremental" as const)
                  : ("full" as const)),
            }
          : {}),
        personId: parsed.data.personId,
        runId,
        triggeredByUserId: parsed.data.triggeredByUserId ?? null,
        triggerType: parsed.data.triggerType,
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
    {
      queued: true;
    },
    {
      code: "dispatch_failed" | "validation_error";
      message: string;
    }
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
export const initialXeroSyncEventName = "initial-xero-sync";
export function getInitialSyncEventId(
  connectionId: string,
  requestedAt: string
): string {
  return `initial-sync:${connectionId}:${requestedAt}`;
}
const InitialXeroSyncEventSchema = z.object({
  clerkOrgId: z.string().min(1),
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
  requestedAt: z.string().datetime().optional(),
  runId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
});
export type InitialXeroSyncInput = z.infer<typeof InitialXeroSyncEventSchema>;
export async function dispatchInitialXeroSync(
  input: z.input<typeof InitialXeroSyncEventSchema>,
  options?: DispatchSyncEventOptions
): Promise<
  Result<
    {
      eventName: string;
      ids: string[];
      queued: true;
    },
    {
      code: "dispatch_failed" | "validation_error";
      message: string;
    }
  >
> {
  const parsed = InitialXeroSyncEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid initial sync event.",
      },
      ok: false,
    };
  }
  try {
    const requestedAt = await ensureXeroInitialSyncRequested(parsed.data);
    if (
      !requestedAt ||
      (parsed.data.requestedAt && parsed.data.requestedAt !== requestedAt)
    ) {
      return {
        error: {
          code: "dispatch_failed",
          message: "The initial Xero import request is no longer active.",
        },
        ok: false,
      };
    }
    const eventId =
      options?.eventId ??
      getInitialSyncEventId(parsed.data.connectionId, requestedAt);
    const payload = {
      data: {
        clerkOrgId: parsed.data.clerkOrgId,
        connectionId: parsed.data.connectionId,
        organisationId: parsed.data.organisationId,
        requestedAt,
        runId: parsed.data.runId ?? randomUUID(),
        triggeredByUserId: parsed.data.triggeredByUserId ?? null,
        triggerType: parsed.data.triggerType,
      },
      id: eventId,
      name: initialXeroSyncEventName,
    };
    const sent = await inngest.send(payload);
    return {
      ok: true,
      value: {
        eventName: initialXeroSyncEventName,
        ids: sent.ids,
        queued: true,
      },
    };
  } catch {
    return {
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the initial sync job.",
      },
      ok: false,
    };
  }
}
