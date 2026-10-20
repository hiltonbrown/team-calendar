import { toXeroConnectionDisplayState } from "@repo/core";
import "server-only";
import { auth, currentUser } from "@repo/auth/server";
import {
  getRecord,
  getXeroConnectionStateForScope,
  isXeroLeaveType,
  managerScopePersonIds,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import {
  resolveAccountCompanies,
  scopedQuery,
  TENANT_READ_TRANSACTION_OPTIONS,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withOrg } from "@/lib/navigation/org-url";
import type { PlanRecordFormInput } from "./_schemas";
import { formatPlanDateTime } from "./plan-form-time";

interface LoadPlanFormDataInput {
  org?: string;
  personId?: string;
  recordId?: string;
  startsAt?: string;
}
const PrefillStartSchema = z.union([
  z.iso.date(),
  z.iso
    .datetime({ local: true, precision: -1 })
    .refine((value) => !value.endsWith("Z")),
]);
export async function loadPlanFormData({
  org,
  personId,
  recordId,
  startsAt,
}: LoadPlanFormDataInput) {
  assertNoTenantTransaction("loadPlanFormData");
  const [user, { orgId, orgRole }] = await Promise.all([currentUser(), auth()]);
  if (!(user && orgId)) {
    redirect("/");
  }
  // Trusted Clerk account is resolved before one form-data read scope.
  const clerkOrgId = orgId as ClerkOrgId;
  return withTenantDb(
    clerkOrgId,
    async (db) => {
      const companies = await resolveAccountCompanies(clerkOrgId, db);
      const companyIds = companies.map((company) => company.id);
      const { currentPerson, organisationId } = await resolveFormTarget(
        {
          clerkOrgId,
          companies,
          companyIds,
          org,
          personId,
          recordId,
          userId: user.id,
        },
        db
      );
      const orgQueryValue = organisationId;
      const canSelectPerson =
        orgRole === "org:admin" ||
        orgRole === "org:owner" ||
        orgRole === "org:manager";
      let people: Array<{
        email: string;
        first_name: string | null;
        id: string;
        last_name: string | null;
      }> = [];
      people = await resolveFormPeople(
        { canSelectPerson, clerkOrgId, currentPerson, organisationId, orgRole },
        db
      );
      const xeroStateResult = await getXeroConnectionStateForScope(
        {
          clerkOrgId,
          organisationId,
        },
        db
      );
      const xeroConnectionState = toXeroConnectionDisplayState(xeroStateResult);
      const recordResult = recordId
        ? await getRecord(
            {
              actingOrgRole: orgRole,
              actingUserId: user.id,
              clerkOrgId,
              organisationId,
              recordId,
            },
            db
          )
        : null;
      if (recordResult && !recordResult.ok) {
        notFound();
      }
      const organisation = await db.organisation.findFirst({
        select: { timezone: true },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          id: organisationId,
        },
      });
      const timezone = organisation?.timezone ?? "UTC";
      const record = recordResult?.ok
        ? toEditableRecord(recordResult.value, timezone)
        : undefined;
      const prefillRecord =
        record ??
        createPrefillRecord({
          people,
          personId,
          startsAt,
        });
      const balancePersonId = prefillRecord?.personId ?? people[0]?.id;
      const balanceRecordType = prefillRecord?.recordType ?? "annual_leave";
      const balance =
        balancePersonId && isXeroLeaveType(balanceRecordType)
          ? await db.leaveBalance.findFirst({
              orderBy: { updated_at: "desc" },
              select: {
                balance: true,
                balance_unit: true,
                currency_code: true,
              },
              where: {
                ...scopedQuery(clerkOrgId, organisationId as OrganisationId),
                person_id: balancePersonId,
                record_type: balanceRecordType,
              },
            })
          : null;
      return {
        balanceAvailable: balance ? Number(balance.balance) : null,
        balanceCurrencyCode: balance?.currency_code ?? null,
        balanceUnit: balance?.balance_unit ?? null,
        canSelectPerson,
        closeHref: withOrg("/plans", orgQueryValue),
        organisationId,
        people: people.map((person) => ({
          email: person.email,
          id: person.id,
          label: `${person.first_name} ${person.last_name}`,
        })),
        record: prefillRecord,
        timezone,
        xeroConnectionState,
      };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
}
function createPrefillRecord({
  people,
  personId,
  startsAt,
}: {
  people: Array<{
    id: string;
  }>;
  personId?: string;
  startsAt?: string;
}) {
  const parsed = PrefillStartSchema.safeParse(startsAt);
  if (!parsed.success) {
    return;
  }
  const date = parsed.data.slice(0, 10);
  const startTime = parsed.data.includes("T") ? parsed.data.slice(11, 16) : "";
  const end = startTime
    ? new Date(new Date(`${date}T${startTime}:00Z`).getTime() + 3_600_000)
    : null;
  const requestedPerson = people.find((person) => person.id === personId);
  return {
    allDay: !startTime,
    contactabilityStatus: "contactable" as const,
    endsAt: end?.toISOString().slice(0, 10) ?? date,
    endTime: end?.toISOString().slice(11, 16) ?? "",
    notesInternal: "",
    personId: requestedPerson?.id ?? people[0]?.id ?? "",
    privacyMode: "named" as const,
    recordType: "annual_leave" as const,
    startsAt: date,
    startTime,
  };
}
function toEditableRecord(
  record: Extract<
    Awaited<ReturnType<typeof getRecord>>,
    {
      ok: true;
    }
  >["value"],
  timezone: string
) {
  const displayTimezone = record.allDay ? "UTC" : timezone;
  const start = formatPlanDateTime(record.startsAt, displayTimezone);
  const end = formatPlanDateTime(record.endsAt, displayTimezone);
  return {
    allDay: record.allDay,
    contactabilityStatus: record.contactabilityStatus,
    endsAt: end.date,
    endTime: end.time,
    id: record.id,
    notesInternal: record.notesInternal ?? "",
    personId: record.personId,
    privacyMode: record.privacyMode,
    // Persisted records have already passed the user-creatable record validator.
    recordType: record.recordType as PlanRecordFormInput["recordType"],
    startsAt: start.date,
    startTime: start.time,
  };
}

async function resolveFormTarget(
  input: LoadPlanFormDataInput & {
    clerkOrgId: ClerkOrgId;
    userId: string;
    companyIds: string[];
    companies: Array<{ id: string }>;
  },
  db: TenantDb
) {
  const { org, personId, recordId, clerkOrgId, userId, companyIds, companies } =
    input;
  const accountScope = {
    clerk_org_id: clerkOrgId,
    organisation_id: { in: companyIds },
  };
  const currentPerson = await db.person.findFirst({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      email: true,
      first_name: true,
      id: true,
      last_name: true,
      organisation_id: true,
    },
    where: { ...accountScope, archived_at: null, clerk_user_id: userId },
  });
  let target: { organisation_id: string } | null = null;
  if (recordId) {
    target = await db.availabilityRecord.findFirst({
      select: { organisation_id: true },
      where: { ...accountScope, id: recordId },
    });
  } else if (personId) {
    target = await db.person.findFirst({
      select: { organisation_id: true },
      where: { ...accountScope, archived_at: null, id: personId },
    });
  }
  if ((recordId || personId) && !target) {
    notFound();
  }
  // The company is selected only from owned account companies below.
  const organisationId =
    target?.organisation_id ??
    org ??
    currentPerson?.organisation_id ??
    companies[0]?.id;
  if (
    !(organisationId && companyIds.includes(organisationId)) ||
    (org && target && org !== target.organisation_id)
  ) {
    notFound();
  }
  return { currentPerson, organisationId };
}

async function resolveFormPeople(
  input: {
    clerkOrgId: ClerkOrgId;
    organisationId: string;
    orgRole: string | null | undefined;
    currentPerson: Awaited<
      ReturnType<typeof resolveFormTarget>
    >["currentPerson"];
    canSelectPerson: boolean;
  },
  db: TenantDb
) {
  const {
    clerkOrgId,
    organisationId,
    orgRole,
    currentPerson,
    canSelectPerson,
  } = input;
  let people: Array<{
    email: string;
    first_name: string | null;
    id: string;
    last_name: string | null;
  }> = [];
  let managerIds: string[] | null = null;
  if (orgRole === "org:manager") {
    managerIds = currentPerson
      ? await managerScopePersonIds(
          { actingPersonId: currentPerson.id, clerkOrgId },
          db
        )
      : [];
  }
  if (canSelectPerson) {
    people = await db.person.findMany({
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
      select: {
        email: true,
        first_name: true,
        id: true,
        last_name: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId as OrganisationId),
        archived_at: null,
        ...(managerIds ? { id: { in: managerIds } } : {}),
      },
    });
  } else if (
    currentPerson &&
    currentPerson.organisation_id === organisationId
  ) {
    people = [currentPerson];
  }
  return people;
}
