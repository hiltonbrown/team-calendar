import { auth, currentUser } from "@repo/auth/server";
import {
  type ApprovalRole,
  getApprovalSummaryCounts,
  listForApprover,
} from "@repo/availability";
import { database } from "@repo/database";
import { z } from "zod";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import {
  PermissionDeniedError,
  requirePageRole,
} from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { LeaveApprovalsClient } from "./leave-approvals-client";

export const metadata = {
  title: "Leave Approvals | Team Calendar",
  description: "Approve and manage team leave requests.",
};

interface LeaveApprovalsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FilterSchema = z.object({
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
  ).default(["submitted"]),
});
type ApprovalStatusFilter = z.infer<typeof FilterSchema>["status"][number];

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
  const { org } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const [{ orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (!user) {
    return <PermissionDeniedState />;
  }

  const actingPerson = await database.person.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      clerk_user_id: user.id,
      organisation_id: organisationId,
    },
    select: { id: true },
  });

  const role = effectiveApprovalRole(orgRole);
  if (!role || (role === "manager" && !actingPerson)) {
    return <PermissionDeniedState />;
  }

  const parsedFilters = parseFilterParams(params, FilterSchema) ?? {
    includeFailed: false,
    status: ["submitted"],
  };
  const status: ApprovalStatusFilter[] = parsedFilters.status ?? ["submitted"];
  const statusWithFailed: ApprovalStatusFilter[] =
    parsedFilters.includeFailed && !status.includes("xero_sync_failed")
      ? [...status, "xero_sync_failed"]
      : status;
  const filters = {
    dateFrom: parsedFilters.dateFrom,
    dateTo: parsedFilters.dateTo,
    personId: parsedFilters.personId,
    recordType: parsedFilters.recordType,
    status: statusWithFailed,
  };

  const serviceInput = {
    actingPersonId: actingPerson?.id ?? null,
    actingUserId: user.id,
    clerkOrgId,
    organisationId,
    role,
  };
  const [approvalsResult, summaryResult] = await Promise.all([
    listForApprover({ ...serviceInput, filters }),
    getApprovalSummaryCounts(serviceInput),
  ]);

  if (!(approvalsResult.ok && summaryResult.ok)) {
    return (
      <>
        <Header page="Leave Approvals" />
        <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
          <FetchErrorState entityName="leave approvals" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header page="Leave Approvals" />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <LeaveApprovalsClient
          canDispatchReconciliation={role === "admin"}
          filters={{
            includeFailed: parsedFilters.includeFailed ?? false,
            status,
          }}
          items={approvalsResult.value}
          organisationId={organisationId}
          reconciliationEnabled={false}
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
