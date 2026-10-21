import { auth, currentUser } from "@repo/auth/server";
import {
  type ApprovalRole,
  getApprovalSummaryCounts,
  listForApprover,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import { z } from "zod";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import {
  PermissionDeniedError,
  requirePageRole,
} from "@/lib/auth/require-page-role";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { resolveApprovalActingPerson } from "./acting-person";
import { LeaveApprovalsClient } from "./leave-approvals-client";

export const metadata = {
  description: "Approve and manage team leave requests.",
  title: "Leave Approvals | Team Calendar",
};

interface LeaveApprovalsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FilterSchema = z.object({
  cursor: firstString(z.string().uuid().nullable().optional()),
  dateFrom: firstString(z.coerce.date().optional()),
  dateTo: firstString(z.coerce.date().optional()),
  includeFailed: firstString(
    z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true")
  ),
  personId: arrayParam(z.string().uuid()).optional(),
  recordType: arrayParam(
    z.enum([
      "annual_leave",
      "personal_leave",
      "holiday",
      "sick_leave",
      "long_service_leave",
      "unpaid_leave",
    ])
  ).optional(),
  status: arrayParam(
    z.enum([
      "submitted",
      "approved",
      "declined",
      "xero_sync_failed",
      "withdrawn",
    ])
  ).optional(),
});
type ApprovalStatusFilter = NonNullable<
  z.infer<typeof FilterSchema>["status"]
>[number];

const LeaveApprovalsPage = async ({
  searchParams,
}: LeaveApprovalsPageProps) => {
  try {
    await requirePageRole("org:manager");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return <PermissionDeniedState />;
    }
    throw error;
  }

  const params = await searchParams;
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = effectiveApprovalRole(orgRole);
  if (!(orgId && user && role)) {
    return <PermissionDeniedState />;
  }
  // Authenticated Clerk account, resolved before the read scope.
  const clerkOrgId = orgId as ClerkOrgId;
  const parsedFilters = parseFilterParams(params, FilterSchema);
  const status: ApprovalStatusFilter[] | undefined = parsedFilters?.status;
  const statusWithFailed: ApprovalStatusFilter[] | undefined =
    status &&
    parsedFilters?.includeFailed &&
    !status.includes("xero_sync_failed")
      ? [...status, "xero_sync_failed"]
      : status;
  const filters = {
    dateFrom: parsedFilters?.dateFrom,
    dateTo: parsedFilters?.dateTo,
    personId: parsedFilters?.personId,
    recordType: parsedFilters?.recordType,
    status: statusWithFailed,
  };

  const prepared = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const companies = await resolveAccountCompanies(clerkOrgId, db);
      const actingPerson = await resolveApprovalActingPerson(
        clerkOrgId,
        user.id,
        companies.map((company) => company.id),
        db
      );
      if (role === "manager" && !actingPerson) {
        return null;
      }
      const serviceInput = {
        actingPersonId: actingPerson?.id ?? null,
        actingUserId: user.id,
        clerkOrgId,
        role,
      };
      const approvalsResult = await listForApprover(
        { ...serviceInput, cursor: parsedFilters?.cursor ?? null, filters },
        db
      );
      const summaryResult = await getApprovalSummaryCounts(serviceInput, db);
      return { approvalsResult, summaryResult };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  if (!prepared) {
    return <PermissionDeniedState />;
  }
  const { approvalsResult, summaryResult } = prepared;
  if (!(approvalsResult.ok && summaryResult.ok)) {
    return (
      <>
        <Header page="Leave Approvals" showCompanySelector={false} />
        <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
          <FetchErrorState entityName="leave approvals" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header page="Leave Approvals" showCompanySelector={false} />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <LeaveApprovalsClient
          canDispatchReconciliation={role === "admin"}
          filters={{
            includeFailed: parsedFilters?.includeFailed ?? false,
            status: parsedFilters?.status,
          }}
          items={approvalsResult.value.items}
          nextCursor={approvalsResult.value.nextCursor}
          summary={summaryResult.value}
        />
      </div>
    </>
  );
};

export default LeaveApprovalsPage;

function effectiveApprovalRole(
  role: string | null | undefined
): ApprovalRole | null {
  if (role === "org:owner" || role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  return null;
}

function arrayParam<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => String(item).split(",")).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(",").filter(Boolean);
    }
    return [];
  }, z.array(schema));
}

function firstString<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }, schema);
}
