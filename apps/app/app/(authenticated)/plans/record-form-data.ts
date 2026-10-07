import { toXeroConnectionDisplayState } from "@repo/core";
import "server-only";
import { auth, currentUser } from "@repo/auth/server";
import {
  getRecord,
  getXeroConnectionStateForScope,
  isXeroLeaveType,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  const user = await currentUser();
  const { orgRole } = await auth();
  if (!user) {
    redirect("/");
  }
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(org);
  const currentPerson = await database.person.findFirst({
    select: {
      email: true,
      first_name: true,
      id: true,
      last_name: true,
    },
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
  });
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
  if (canSelectPerson) {
    people = await database.person.findMany({
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
      select: {
        email: true,
        first_name: true,
        id: true,
        last_name: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        archived_at: null,
        ...(orgRole === "org:manager" && currentPerson
          ? {
              OR: [
                { id: currentPerson.id },
                { manager_person_id: currentPerson.id },
              ],
            }
          : {}),
      },
    });
  } else if (currentPerson) {
    people = [currentPerson];
  }
  const xeroStateResult = await getXeroConnectionStateForScope({
    clerkOrgId,
    organisationId,
  });
  const xeroConnectionState = toXeroConnectionDisplayState(xeroStateResult);
  const recordResult = recordId
    ? await getRecord({
        actingOrgRole: orgRole,
        actingUserId: user.id,
        clerkOrgId,
        organisationId,
        recordId,
      })
    : null;
  if (recordResult && !recordResult.ok) {
    notFound();
  }
  const organisation = await database.organisation.findFirst({
    select: { timezone: true },
    where: { archived_at: null, clerk_org_id: clerkOrgId, id: organisationId },
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
      ? await database.leaveBalance.findFirst({
          orderBy: { updated_at: "desc" },
          select: {
            balance: true,
            balance_unit: true,
            currency_code: true,
          },
          where: {
            ...scopedQuery(clerkOrgId, organisationId),
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
