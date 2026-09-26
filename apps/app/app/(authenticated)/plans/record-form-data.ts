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
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import type { PlanRecordFormInput } from "./_schemas";

interface LoadPlanFormDataInput {
  org?: string;
  personId?: string;
  recordId?: string;
  startsAt?: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  const record = recordResult?.ok
    ? {
        allDay: recordResult.value.allDay,
        contactabilityStatus: recordResult.value.contactabilityStatus,
        endsAt: dateInput(recordResult.value.endsAt),
        endTime: timeInput(recordResult.value.endsAt),
        id: recordResult.value.id,
        notesInternal: recordResult.value.notesInternal ?? "",
        personId: recordResult.value.personId,
        privacyMode: recordResult.value.privacyMode,
        recordType: recordResult.value
          .recordType as PlanRecordFormInput["recordType"],
        startsAt: dateInput(recordResult.value.startsAt),
        startTime: timeInput(recordResult.value.startsAt),
      }
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
    xeroConnectionState,
  };
}

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function timeInput(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function createPrefillRecord({
  people,
  personId,
  startsAt,
}: {
  people: Array<{ id: string }>;
  personId?: string;
  startsAt?: string;
}) {
  if (!startsAt) {
    return;
  }
  const date = startsAt.includes("T") ? startsAt.slice(0, 10) : startsAt;
  if (!DATE_ONLY_PATTERN.test(date)) {
    return;
  }
  const requestedPerson = people.find((person) => person.id === personId);
  return {
    allDay: true,
    contactabilityStatus: "contactable" as const,
    endsAt: date,
    endTime: "",
    notesInternal: "",
    personId: requestedPerson?.id ?? people[0]?.id ?? "",
    privacyMode: "named" as const,
    recordType: "annual_leave" as const,
    startsAt: date,
    startTime: "",
  };
}
