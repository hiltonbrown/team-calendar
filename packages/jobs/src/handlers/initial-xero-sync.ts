import "server-only";
import { randomUUID } from "node:crypto";
import type { Result } from "@repo/core";
import {
  completeXeroInitialSync,
  ensureXeroInitialSyncRequested,
} from "@repo/database/queries/xero-sync-cursors";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { captureInitialSyncCompleted } from "../activation";
import { inngest } from "../client";
import { syncXeroLeaveBalances } from "./sync-xero-leave-balances";
import { syncXeroLeaveRecords } from "./sync-xero-leave-records";
import { syncXeroPeople } from "./sync-xero-people";
import { isCurrentXeroSyncBinding } from "./xero-sync-access";

const InputSchema = z.object({
  clerkOrgId: z.string().min(1),
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
  requestedAt: z.string().datetime().optional(),
  runId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
});
export type InitialXeroSyncInput = z.infer<typeof InputSchema>;
export interface InitialXeroSyncError {
  code: "validation_error" | "unknown_error";
  message: string;
}
export interface InitialXeroSyncResult {
  completedAt: Date;
  leaveBalances: unknown;
  leaveRecords: unknown;
  people: unknown;
}
type RunStep = <T>(name: string, operation: () => Promise<T>) => Promise<T>;
function successfulPhase<T extends { status: string }>(
  result: Result<T, { code: string; message: string }>
): T {
  if (!result.ok || result.value.status !== "succeeded") {
    throw new Error("Initial Xero import phase did not complete successfully.");
  }
  return result.value;
}
async function executeInitialSync(
  input: InitialXeroSyncInput,
  runStep: RunStep
): Promise<InitialXeroSyncResult | { status: "ignored" }> {
  if (!(await isCurrentXeroSyncBinding(input))) {
    return { status: "ignored" };
  }
  const requestedAt =
    input.requestedAt ?? (await ensureXeroInitialSyncRequested(input));
  if (!requestedAt) {
    throw new Error("Initial Xero import request is no longer active.");
  }
  const phaseInput = { ...input, mode: "full" as const, requestedAt };
  // Each phase/page is its own sync run; a successful people run cannot short-circuit leave or balances.
  const people = await runStep("sync-people", async () =>
    successfulPhase(
      await syncXeroPeople({ ...phaseInput, runId: randomUUID() })
    )
  );
  const leaveRecords = await runStep("sync-leave-records", async () =>
    successfulPhase(
      await syncXeroLeaveRecords({ ...phaseInput, runId: randomUUID() })
    )
  );
  const leaveBalances: unknown[] = [];
  let hasMore = true;
  for (let page = 0; hasMore; page += 1) {
    const result = await runStep(`sync-leave-balances-${page}`, async () =>
      successfulPhase(
        await syncXeroLeaveBalances({ ...phaseInput, runId: randomUUID() })
      )
    );
    leaveBalances.push(result);
    hasMore = result.hasMore === true;
  }
  const completedAt = await runStep("complete-initial-import", async () => {
    const completed = await completeXeroInitialSync({ ...input, requestedAt });
    if (!completed) {
      throw new Error("Initial Xero import request changed.");
    }
    await captureInitialSyncCompleted(input);
    return completed;
  });
  return { completedAt, leaveBalances, leaveRecords, people };
}
export const initialXeroSyncFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      concurrency: { key: "event.data.connectionId", limit: 1 },
      id: "initial-xero-sync",
      triggers: { event: "initial-xero-sync" },
    },
    async ({ event, step }) =>
      executeInitialSync(InputSchema.parse(event.data), (name, operation) =>
        step.run(name, operation)
      )
  );
export async function initialXeroSync(
  input: unknown
): Promise<
  Result<InitialXeroSyncResult | { status: "ignored" }, InitialXeroSyncError>
> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message:
          parsed.error.issues[0]?.message ?? "Invalid initial sync request.",
      },
      ok: false,
    };
  }
  try {
    return {
      ok: true,
      value: await executeInitialSync(parsed.data, async (_, operation) =>
        operation()
      ),
    };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Initial Xero import did not complete.",
      },
      ok: false,
    };
  }
}
