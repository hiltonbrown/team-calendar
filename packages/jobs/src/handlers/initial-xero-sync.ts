import "server-only";

import type { Result } from "@repo/core";
import { XeroCampaignEventSchema } from "@repo/database/xero-campaign-contract";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { captureInitialSyncCompleted } from "../activation";
import { inngest } from "../client";
import { syncXeroLeaveBalances } from "./sync-xero-leave-balances";
import { syncXeroLeaveRecords } from "./sync-xero-leave-records";
import { syncXeroPeople } from "./sync-xero-people";
import { rejectRetryableSyncResult } from "./xero-sync-access";

const InitialXeroSyncInputSchema = z.object({
  bindingGeneration: z.number().int().nonnegative(),
  campaign: XeroCampaignEventSchema.optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  xeroTenantId: z.string().uuid(),
});

export type InitialXeroSyncInput = z.infer<typeof InitialXeroSyncInputSchema>;

export type InitialXeroSyncError =
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

export interface InitialXeroSyncResult {
  completedAt: Date;
  leaveBalances: unknown;
  leaveRecords: unknown;
  people: unknown;
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
      id: "initial-xero-sync",
      triggers: { event: "initial-xero-sync" },
    },
    async ({ event, step, runId: workerRunId }) => {
      const peopleResult = await step.run("sync-people", async () =>
        rejectRetryableSyncResult(syncXeroPeople(event.data, workerRunId))
      );

      const leaveRecordsResult = await step.run(
        "sync-leave-records",
        async () =>
          rejectRetryableSyncResult(
            syncXeroLeaveRecords(event.data, workerRunId)
          )
      );

      const leaveBalancesResult = await step.run(
        "sync-leave-balances",
        async () =>
          rejectRetryableSyncResult(
            syncXeroLeaveBalances(event.data, workerRunId)
          )
      );

      await step.run("finalise-activation", async () =>
        captureInitialSyncCompleted(event.data)
      );

      return {
        completedAt: new Date(),
        leaveBalances: leaveBalancesResult,
        leaveRecords: leaveRecordsResult,
        people: peopleResult,
      };
    }
  );

export async function initialXeroSync(
  input: unknown,
  workerRunId: string | null = null
): Promise<Result<InitialXeroSyncResult, InitialXeroSyncError>> {
  const parsed = InitialXeroSyncInputSchema.safeParse(input);
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

  const peopleResult = await syncXeroPeople(parsed.data, workerRunId);
  const leaveRecordsResult = await syncXeroLeaveRecords(
    parsed.data,
    workerRunId
  );
  const leaveBalancesResult = await syncXeroLeaveBalances(
    parsed.data,
    workerRunId
  );

  await captureInitialSyncCompleted(parsed.data);

  return {
    ok: true,
    value: {
      completedAt: new Date(),
      leaveBalances: leaveBalancesResult,
      leaveRecords: leaveRecordsResult,
      people: peopleResult,
    },
  };
}
