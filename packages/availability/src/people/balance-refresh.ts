import { hasPermission } from "@repo/auth/permissions";
import { log } from "@repo/observability/log";
import "server-only";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { xeroRecoveryMessage } from "@repo/core";
import {
  assertTenantDb,
  scopedQuery,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";
import { dispatchSyncEvent } from "../sync/sync-events";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
export type BalanceRefreshError =
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "person_not_found";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
export type BalanceRefreshReason =
  | "dispatch_failed"
  | "job_not_registered"
  | "not_xero_linked"
  | "xero_not_connected";
export type BalanceRefreshDispatcher = (payload: {
  accountId: string;
  dispatchedBy: string;
  organisationId: string;
  personId: string;
  connectionId: string;
}) => Promise<
  Result<
    void,
    {
      message: string;
    }
  >
>;
let balanceRefreshDispatcher: BalanceRefreshDispatcher | null = null;
export function setBalanceRefreshDispatcher(
  dispatcher: BalanceRefreshDispatcher | null
): void {
  balanceRefreshDispatcher = dispatcher;
}
const DispatchBalanceRefreshSchema = z.object({
  accountId: z.string().min(1),
  actingRole: z.enum(["admin", "manager", "owner", "viewer"]),
  actingUserId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});
type BalanceRefreshInput = z.infer<typeof DispatchBalanceRefreshSchema>;
interface BalanceRefreshOutcome {
  queued: boolean;
  reason?: BalanceRefreshReason;
}
export type PreparedBalanceRefresh =
  | { kind: "skip"; input: BalanceRefreshInput; outcome: BalanceRefreshOutcome }
  | {
      kind: "send";
      input: BalanceRefreshInput;
      payload: Parameters<BalanceRefreshDispatcher>[0];
    };

export async function dispatchBalanceRefresh(
  input: BalanceRefreshInput
): Promise<Result<BalanceRefreshOutcome, BalanceRefreshError>> {
  assertNoTenantTransaction("dispatchBalanceRefresh");
  try {
    const prepared = await withTenantDb(input.accountId, (db) =>
      prepareBalanceRefresh(input, db)
    );
    if (!prepared.ok) {
      return prepared;
    }
    const sent = await sendPreparedBalanceRefresh(prepared.value);
    if (!sent.ok) {
      return sent;
    }
    const outcome = sent.value;
    const audited = await withTenantDb(input.accountId, (db) =>
      recordBalanceRefreshDispatch(input, outcome, db)
    );
    return audited.ok ? sent : audited;
  } catch {
    return balanceRefreshUnknownError();
  }
}

export async function prepareBalanceRefresh(
  input: BalanceRefreshInput,
  db: TenantDb
): Promise<Result<PreparedBalanceRefresh, BalanceRefreshError>> {
  assertTenantDb(db, input.accountId);
  const parsed = DispatchBalanceRefreshSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!hasPermission(parsed.data.actingRole, { balances: ["manage"] })) {
    return notAuthorised();
  }
  try {
    const scoped = scopedQuery(
      parsed.data.accountId as AccountId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await db.person.findFirst({
      select: {
        id: true,
        xero_employee_id: true,
      },
      where: {
        ...scoped,
        id: parsed.data.personId,
      },
    });
    if (!person) {
      return await personNotFound(parsed.data, db);
    }
    if (!person.xero_employee_id) {
      const value = { queued: false, reason: "not_xero_linked" as const };
      return {
        ok: true,
        value: { input: parsed.data, kind: "skip", outcome: value },
      };
    }
    const xeroStateResult = await getXeroConnectionStateForScope(
      {
        accountId: parsed.data.accountId,
        organisationId: parsed.data.organisationId,
      },
      db
    );
    if (!xeroStateResult.ok) {
      return {
        error: {
          code: "unknown_error",
          message:
            "We cannot reach Xero right now. Try again later or contact support.",
        },
        ok: false,
      };
    }
    const xeroConnectionState = xeroStateResult.value.state;
    if (
      xeroConnectionState !== "connected" &&
      xeroConnectionState !== "not_connected"
    ) {
      return {
        error: {
          code: "unknown_error",
          message: xeroRecoveryMessage(xeroConnectionState),
        },
        ok: false,
      };
    }
    const hasXero = xeroConnectionState === "connected";
    if (!hasXero) {
      const value = { queued: false, reason: "xero_not_connected" as const };
      return {
        ok: true,
        value: { input: parsed.data, kind: "skip", outcome: value },
      };
    }
    const xeroConnection = await db.xeroConnection.findFirst({
      select: { id: true },
      where: {
        ...scoped,
        organisation_id: parsed.data.organisationId,
      },
    });
    if (!xeroConnection) {
      const value = { queued: false, reason: "xero_not_connected" as const };
      return {
        ok: true,
        value: { input: parsed.data, kind: "skip", outcome: value },
      };
    }
    if (!balanceRefreshDispatcher) {
      const value = { queued: false, reason: "job_not_registered" as const };
      return {
        ok: true,
        value: { input: parsed.data, kind: "skip", outcome: value },
      };
    }
    return {
      ok: true,
      value: {
        input: parsed.data,
        kind: "send",
        payload: {
          accountId: parsed.data.accountId,
          connectionId: xeroConnection.id,
          dispatchedBy: parsed.data.actingUserId,
          organisationId: parsed.data.organisationId,
          personId: parsed.data.personId,
        },
      },
    };
  } catch {
    return balanceRefreshUnknownError();
  }
}

export async function sendPreparedBalanceRefresh(
  prepared: PreparedBalanceRefresh
): Promise<Result<BalanceRefreshOutcome, BalanceRefreshError>> {
  assertNoTenantTransaction("sendPreparedBalanceRefresh");
  if (prepared.kind === "skip") {
    return { ok: true, value: prepared.outcome };
  }
  if (!balanceRefreshDispatcher) {
    return { ok: true, value: { queued: false, reason: "job_not_registered" } };
  }
  try {
    const sent = await balanceRefreshDispatcher(prepared.payload);
    // Preserve the existing non-fatal failed-dispatch receipt.
    return {
      ok: true,
      value: sent.ok
        ? { queued: true }
        : { queued: false, reason: "dispatch_failed" },
    };
  } catch {
    return balanceRefreshUnknownError();
  }
}

function balanceRefreshUnknownError(): Result<never, BalanceRefreshError> {
  return {
    error: {
      code: "unknown_error",
      message: "Failed to dispatch balance refresh.",
    },
    ok: false,
  };
}
export async function recordBalanceRefreshDispatch(
  input: BalanceRefreshInput,
  result: {
    queued: boolean;
    reason?: BalanceRefreshReason;
  },
  db: TenantDb
): Promise<Result<void, BalanceRefreshError>> {
  assertTenantDb(db, input.accountId);
  try {
    await db.auditEvent.create({
      data: {
        account_id: input.accountId,
        action: "availability_records.balance_refresh_dispatched",
        actor_user_id: input.actingUserId,
        organisation_id: input.organisationId,
        payload: {
          actingUserId: input.actingUserId,
          personId: input.personId,
          queued: result.queued,
          reason: result.reason ?? null,
        },
        resource_id: input.personId,
        resource_type: "person",
      },
    });
    return { ok: true, value: undefined };
  } catch {
    return balanceRefreshUnknownError();
  }
}
async function personNotFound(
  input: {
    accountId: string;
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<Result<never, BalanceRefreshError>> {
  const exists = await db.person.findFirst({
    select: { account_id: true, organisation_id: true },
    where: { id: input.personId },
  });
  if (
    exists &&
    (exists.account_id !== input.accountId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingAccountId: input.accountId,
      actingOrganisationId: input.organisationId,
      resourceId: input.personId,
      resourceType: "person",
    });
  }
  return {
    error: { code: "person_not_found", message: "Person not found." },
    ok: false,
  };
}
function validationError(
  error: z.ZodError
): Result<never, BalanceRefreshError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid balance refresh request.",
    },
    ok: false,
  };
}
function notAuthorised(): Result<never, BalanceRefreshError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to refresh balances.",
    },
    ok: false,
  };
}
setBalanceRefreshDispatcher(async (payload) => {
  const result = await dispatchSyncEvent({
    accountId: payload.accountId,
    connectionId: payload.connectionId,
    organisationId: payload.organisationId,
    personId: payload.personId,
    runType: "leave_balances",
    triggeredByUserId: payload.dispatchedBy,
    triggerType: "manual",
  });
  if (!result.ok) {
    return {
      error: { message: result.error.message },
      ok: false,
    };
  }
  return { ok: true, value: undefined };
});
