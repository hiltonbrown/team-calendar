import { hasPermission as can } from "@repo/auth/permissions";
import { toXeroConnectionDisplayState } from "@repo/core";
import "server-only";
import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  getRecord,
  getXeroConnectionStateForScope,
  isXeroLeaveType,
  managerScopePersonIds,
} from "@repo/availability";
import type { AccountId, OrganisationId } from "@repo/core";
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
  const [user, { accountId: sessionAccountId, role: sessionRole }] =
    await Promise.all([
      getCurrentUser(),
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
    ]);
  if (!(user && sessionAccountId)) {
    redirect("/");
  }
  // Trusted Account is resolved before one form-data read scope.
  const accountId = sessionAccountId as AccountId;
  return withTenantDb(
    accountId,
    async (db) => {
      const companies = await resolveAccountCompanies(accountId, db);
      const companyIds = companies.map((company) => company.id);
      const { currentPerson, organisationId } = await resolveFormTarget(
        {
          accountId,
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
        can(sessionRole, { plans: ["manageAll"] }) || sessionRole === "manager";
      let people: Array<{
        email: string;
        first_name: string | null;
        id: string;
        last_name: string | null;
      }> = [];
      people = await resolveFormPeople(
        {
          accountId,
          canSelectPerson,
          currentPerson,
          organisationId,
          role: sessionRole,
        },
        db
      );
      const xeroStateResult = await getXeroConnectionStateForScope(
        {
          accountId,
          organisationId,
        },
        db
      );
      const xeroConnectionState = toXeroConnectionDisplayState(xeroStateResult);
      const recordResult = recordId
        ? await getRecord(
            {
              accountId,
              actingRole: sessionRole,
              actingUserId: user.id,
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
          account_id: accountId,
          archived_at: null,
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
                ...scopedQuery(accountId, organisationId as OrganisationId),
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
    accountId: AccountId;
    userId: string;
    companyIds: string[];
    companies: Array<{ id: string }>;
  },
  db: TenantDb
) {
  const { org, personId, recordId, accountId, userId, companyIds, companies } =
    input;
  const accountScope = {
    account_id: accountId,
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
    where: { ...accountScope, archived_at: null, user_id: userId },
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
    accountId: AccountId;
    organisationId: string;
    role: string | null | undefined;
    currentPerson: Awaited<
      ReturnType<typeof resolveFormTarget>
    >["currentPerson"];
    canSelectPerson: boolean;
  },
  db: TenantDb
) {
  const {
    accountId,
    organisationId,
    role: sessionRole,
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
  if (sessionRole === "manager") {
    managerIds = currentPerson
      ? await managerScopePersonIds(
          { accountId, actingPersonId: currentPerson.id },
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
        ...scopedQuery(accountId, organisationId as OrganisationId),
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
