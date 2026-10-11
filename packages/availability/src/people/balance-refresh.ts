import { log } from "@repo/observability/log";
import "server-only";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { xeroRecoveryMessage } from "@repo/core";
import { scopedQuery, tenantDatabase } from "@repo/database";
import { z } from "zod";
import { dispatchSyncEvent } from "../sync/sync-events";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import type { PeopleRole } from "./people-service";
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
  clerkOrgId: string;
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
  actingRole: z.enum(["admin", "manager", "owner", "viewer"]),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});
export async function dispatchBalanceRefresh(input: {
  actingRole: PeopleRole;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<
  Result<
    {
      queued: boolean;
      reason?: BalanceRefreshReason;
    },
    BalanceRefreshError
  >
> {
  const parsed = DispatchBalanceRefreshSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (
    !(parsed.data.actingRole === "admin" || parsed.data.actingRole === "owner")
  ) {
    return notAuthorised();
  }
  try {
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await tenantDatabase(
      parsed.data.clerkOrgId
    ).person.findFirst({
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
      return await personNotFound(parsed.data);
    }
    if (!person.xero_employee_id) {
      const value = { queued: false, reason: "not_xero_linked" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }
    const xeroStateResult = await getXeroConnectionStateForScope({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
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
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }
    const xeroConnection = await tenantDatabase(
      parsed.data.clerkOrgId
    ).xeroConnection.findFirst({
      select: { id: true },
      where: {
        ...scoped,
        organisation_id: parsed.data.organisationId,
      },
    });
    if (!xeroConnection) {
      const value = { queued: false, reason: "xero_not_connected" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }
    if (!balanceRefreshDispatcher) {
      const value = { queued: false, reason: "job_not_registered" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }
    const dispatched = await balanceRefreshDispatcher({
      clerkOrgId: parsed.data.clerkOrgId,
      connectionId: xeroConnection.id,
      dispatchedBy: parsed.data.actingUserId,
      organisationId: parsed.data.organisationId,
      personId: parsed.data.personId,
    });
    if (!dispatched.ok) {
      const value = { queued: false, reason: "dispatch_failed" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }
    const value = { queued: true };
    await auditDispatch(parsed.data, value);
    return { ok: true, value };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to dispatch balance refresh.",
      },
      ok: false,
    };
  }
}
async function auditDispatch(
  input: z.infer<typeof DispatchBalanceRefreshSchema>,
  result: {
    queued: boolean;
    reason?: BalanceRefreshReason;
  }
) {
  await tenantDatabase(input.clerkOrgId).auditEvent.create({
    data: {
      action: "availability_records.balance_refresh_dispatched",
      actor_user_id: input.actingUserId,
      clerk_org_id: input.clerkOrgId,
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
}
async function personNotFound(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<never, BalanceRefreshError>> {
  const exists = await tenantDatabase(input.clerkOrgId).person.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { id: input.personId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
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
    clerkOrgId: payload.clerkOrgId,
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
