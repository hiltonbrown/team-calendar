import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import type {
  availability_record_type,
  leave_balance_unit,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { hasActiveXeroConnection } from "../xero-connection-state";
import type { PeopleRole } from "./people-service";

export type ManualBalanceServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "person_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "xero_connected"; message: string };

const ManualBalanceSchema = z.object({
  actingRole: z.enum(["admin", "manager", "owner", "viewer"]),
  actingUserId: z.string().min(1),
  balance: z.number().finite(),
  balanceUnit: z.enum(["days", "hours"]).nullable().optional(),
  clerkOrgId: z.string().min(1),
  leaveTypeName: z.string().trim().max(200).nullable().optional(),
  leaveTypeXeroId: z.string().trim().min(1).max(200),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  recordType: z
    .enum([
      "leave",
      "annual_leave",
      "personal_leave",
      "holiday",
      "sick_leave",
      "long_service_leave",
      "unpaid_leave",
      "public_holiday",
      "wfh",
      "travel",
      "travelling",
      "training",
      "client_site",
      "another_office",
      "offsite_meeting",
      "contractor_unavailable",
      "limited_availability",
      "alternative_contact",
      "other",
      "leave_request",
    ])
    .nullable()
    .optional(),
});

export async function setManualLeaveBalance(input: {
  actingRole: PeopleRole;
  actingUserId: string;
  balance: number;
  balanceUnit?: leave_balance_unit | null;
  clerkOrgId: string;
  leaveTypeName?: null | string;
  leaveTypeXeroId: string;
  organisationId: string;
  personId: string;
  recordType?: availability_record_type | null;
}): Promise<Result<{ id: string }, ManualBalanceServiceError>> {
  const parsed = ManualBalanceSchema.safeParse(input);
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

    const hasXero = await hasActiveXeroConnection({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    if (hasXero) {
      return {
        ok: false,
        error: {
          code: "xero_connected",
          message:
            "Manual balances can only be edited when Xero is disconnected.",
        },
      };
    }

    const person = await database.person.findFirst({
      where: { ...scoped, id: parsed.data.personId },
      select: { id: true },
    });
    if (!person) {
      return await personNotFoundOrLeak(parsed.data);
    }

    return await createOrUpdateManualBalance(parsed.data, scoped);
  } catch {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to save manual leave balance.",
      },
    };
  }
}

async function createOrUpdateManualBalance(
  input: z.infer<typeof ManualBalanceSchema>,
  scoped: { clerk_org_id: ClerkOrgId; organisation_id: OrganisationId }
): Promise<Result<{ id: string }, ManualBalanceServiceError>> {
  const existing = await findManualBalance(input, scoped);
  if (existing) {
    return await updateManualBalance(input, scoped, existing.id);
  }

  try {
    const created = await database.leaveBalance.create({
      data: {
        ...scoped,
        ...manualBalanceData(input),
        leave_type_xero_id: input.leaveTypeXeroId,
        person_id: input.personId,
        xero_tenant_id: null,
      },
      select: { id: true },
    });
    await auditManualBalance(input, created.id);
    return { ok: true, value: created };
  } catch (error) {
    if (!isUniqueConflict(error)) {
      throw error;
    }
    const conflicting = await findManualBalance(input, scoped);
    if (!conflicting) {
      throw error;
    }
    return await updateManualBalance(input, scoped, conflicting.id);
  }
}

async function updateManualBalance(
  input: z.infer<typeof ManualBalanceSchema>,
  scoped: { clerk_org_id: ClerkOrgId; organisation_id: OrganisationId },
  balanceId: string
): Promise<Result<{ id: string }, ManualBalanceServiceError>> {
  await database.leaveBalance.updateMany({
    data: {
      ...manualBalanceData(input),
      updated_at: new Date(),
    },
    where: { ...scoped, id: balanceId },
  });
  await auditManualBalance(input, balanceId);
  return { ok: true, value: { id: balanceId } };
}

function manualBalanceData(input: z.infer<typeof ManualBalanceSchema>) {
  return {
    balance: input.balance.toFixed(4),
    balance_unit: input.balanceUnit ?? null,
    leave_type_name: input.leaveTypeName ?? null,
    record_type: input.recordType ?? null,
  };
}

function findManualBalance(
  input: z.infer<typeof ManualBalanceSchema>,
  scoped: { clerk_org_id: ClerkOrgId; organisation_id: OrganisationId }
) {
  return database.leaveBalance.findFirst({
    where: {
      ...scoped,
      leave_type_xero_id: input.leaveTypeXeroId,
      person_id: input.personId,
      xero_tenant_id: null,
    },
    select: { id: true },
  });
}

async function auditManualBalance(
  input: z.infer<typeof ManualBalanceSchema>,
  balanceId: string
) {
  await database.auditEvent.create({
    data: {
      action: "leave_balances.manual_balance_saved",
      actor_user_id: input.actingUserId,
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      payload: {
        balance: input.balance,
        balanceUnit: input.balanceUnit ?? null,
        leaveTypeXeroId: input.leaveTypeXeroId,
        personId: input.personId,
      },
      resource_id: balanceId,
      resource_type: "leave_balance",
    },
  });
}

async function personNotFoundOrLeak(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<never, ManualBalanceServiceError>> {
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

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function validationError(
  error: z.ZodError
): Result<never, ManualBalanceServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid manual balance.",
    },
  };
}

function notAuthorised(): Result<never, ManualBalanceServiceError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to edit balances.",
    },
  };
}
