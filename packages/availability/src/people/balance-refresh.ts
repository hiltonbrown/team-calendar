import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { z } from "zod";
import { dispatchSyncEvent } from "../sync/sync-events";
import { hasActiveXeroConnection } from "../xero-connection-state";
import type { PeopleRole } from "./people-service";

export type BalanceRefreshError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "person_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

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
  xeroTenantId: string;
}) => Promise<Result<void, { message: string }>>;

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
    { queued: boolean; reason?: BalanceRefreshReason },
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
    const person = await database.person.findFirst({
      where: {
        ...scoped,
        id: parsed.data.personId,
      },
      select: {
        id: true,
        xero_employee_id: true,
      },
    });
    if (!person) {
      return await personNotFoundOrLeak(parsed.data);
    }

    if (!person.xero_employee_id) {
      const value = { queued: false, reason: "not_xero_linked" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }

    const hasXero = await hasActiveXeroConnection({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    if (!hasXero) {
      const value = { queued: false, reason: "xero_not_connected" as const };
      await auditDispatch(parsed.data, value);
      return { ok: true, value };
    }

    const xeroTenant = await database.xeroTenant.findFirst({
      where: {
        ...scoped,
        organisation_id: parsed.data.organisationId,
        xero_connection: {
          disconnected_at: null,
          refresh_token_encrypted: { not: "" },
          revoked_at: null,
          status: "active",
        },
      },
      select: { id: true },
    });
    if (!xeroTenant) {
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
      dispatchedBy: parsed.data.actingUserId,
      organisationId: parsed.data.organisationId,
      personId: parsed.data.personId,
      xeroTenantId: xeroTenant.id,
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
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to dispatch balance refresh.",
      },
    };
  }
}

async function auditDispatch(
  input: z.infer<typeof DispatchBalanceRefreshSchema>,
  result: { queued: boolean; reason?: BalanceRefreshReason }
) {
  await database.auditEvent.create({
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

async function personNotFoundOrLeak(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<never, BalanceRefreshError>> {
  const exists = await database.person.findFirst({
    where: { id: input.personId },
    select: { clerk_org_id: true, organisation_id: true },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    return {
      ok: false,
      error: {
        code: "cross_org_leak",
        message: "Person is outside this organisation.",
      },
    };
  }
  return {
    ok: false,
    error: { code: "person_not_found", message: "Person not found." },
  };
}

function validationError(
  error: z.ZodError
): Result<never, BalanceRefreshError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid balance refresh request.",
    },
  };
}

function notAuthorised(): Result<never, BalanceRefreshError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to refresh balances.",
    },
  };
}

setBalanceRefreshDispatcher(async (payload) => {
  const result = await dispatchSyncEvent({
    clerkOrgId: payload.clerkOrgId,
    organisationId: payload.organisationId,
    personId: payload.personId,
    runType: "leave_balances",
    triggerType: "manual",
    triggeredByUserId: payload.dispatchedBy,
    xeroTenantId: payload.xeroTenantId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: { message: result.error.message },
    };
  }
  return { ok: true, value: undefined };
});
