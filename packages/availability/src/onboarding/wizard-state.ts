import "server-only";

import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "@repo/database";
import type { StageInput, WizardInputs } from "./wizard-rules";

export interface WizardContext {
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}

type RunType = "leave_balances" | "leave_records" | "people";

// Completion only counts when it happened after the latest import request,
// so a reconnect never shows progress left over from an earlier connection.
function sinceRequest(at: Date | null, requestedAt: Date | null): Date | null {
  if (!at) {
    return null;
  }
  return !requestedAt || at >= requestedAt ? at : null;
}

export async function loadWizardInputs(
  ctx: WizardContext
): Promise<Result<WizardInputs>> {
  const scope = {
    clerk_org_id: ctx.clerkOrgId,
    organisation_id: ctx.organisationId,
  };
  try {
    const [organisation, connection, pendingMatches, person] =
      await Promise.all([
        database.organisation.findFirst({
          select: {
            onboarding_completed_at: true,
            onboarding_step: true,
            timezone: true,
            xero_setup_skipped_at: true,
          },
          where: {
            archived_at: null,
            clerk_org_id: ctx.clerkOrgId,
            id: ctx.organisationId,
          },
        }),
        database.xeroConnection.findFirst({
          select: {
            id: true,
            initial_sync_requested_at: true,
            last_full_leave_records_sync_at: true,
            last_full_people_sync_at: true,
            last_leave_balances_sync_at: true,
          },
          where: { ...scope, status: { in: ["active", "reconnect_required"] } },
        }),
        database.xeroPersonMatch.count({
          where: { ...scope, status: "pending" },
        }),
        database.person.findFirst({
          select: { id: true },
          where: { ...scope, archived_at: null, clerk_user_id: ctx.userId },
        }),
      ]);
    if (!organisation) {
      return {
        error: appError("not_found", "Organisation not found."),
        ok: false,
      };
    }

    let connectionInputs: WizardInputs["connection"] = null;
    if (connection) {
      const requestedAt = connection.initial_sync_requested_at;
      const runs = await database.syncRun.findMany({
        orderBy: { started_at: "desc" },
        select: { run_type: true, status: true },
        take: 30,
        where: {
          ...scope,
          run_type: { in: ["people", "leave_records", "leave_balances"] },
          xero_connection_id: connection.id,
          ...(requestedAt ? { started_at: { gte: requestedAt } } : {}),
        },
      });
      const latest = (type: RunType): StageInput["latestRunStatus"] =>
        runs.find((run) => run.run_type === type)?.status ?? null;
      connectionInputs = {
        balances: {
          completedAt: sinceRequest(
            connection.last_leave_balances_sync_at,
            requestedAt
          ),
          latestRunStatus: latest("leave_balances"),
        },
        importRequestedAt: requestedAt,
        leave: {
          completedAt: sinceRequest(
            connection.last_full_leave_records_sync_at,
            requestedAt
          ),
          latestRunStatus: latest("leave_records"),
        },
        people: {
          completedAt: sinceRequest(
            connection.last_full_people_sync_at,
            requestedAt
          ),
          latestRunStatus: latest("people"),
        },
      };
    }

    return {
      ok: true,
      value: {
        actingUserLinked: Boolean(person),
        completedAt: organisation.onboarding_completed_at,
        connection: connectionInputs,
        organisationTimezone: organisation.timezone,
        pendingMatches,
        step: organisation.onboarding_step,
        xeroSkippedAt: organisation.xero_setup_skipped_at,
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to load setup progress."),
      ok: false,
    };
  }
}
