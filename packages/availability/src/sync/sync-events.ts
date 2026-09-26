import type { Result } from "@repo/core";
import { Inngest } from "inngest";
import { z } from "zod";

function getInngestClient(): Inngest {
  const eventKey = process.env.INNGEST_EVENT_KEY;
  const signingKey = process.env.INNGEST_SIGNING_KEY;
  const devUrl = process.env.INNGEST_DEV;

  // INNGEST_DEV enables the local dev server without production keys. A URL
  // override is passed explicitly; boolean values use the SDK's default
  // http://localhost:8288 endpoint. The API boundary handles a temporarily
  // unavailable local server without changing production dispatch behaviour.
  const baseUrl = devUrl?.startsWith("http") ? devUrl : undefined;

  return new Inngest({
    baseUrl,
    eventKey: eventKey || undefined,
    id: "team-calendar",
    signingKey: signingKey || undefined,
  });
}

const inngest = getInngestClient();

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
    const sent = await inngest.send({
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
    });
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
