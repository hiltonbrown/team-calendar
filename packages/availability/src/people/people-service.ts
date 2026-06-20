import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_approval_status,
  availability_contactability,
  availability_privacy_mode,
  availability_record_type,
  availability_source_type,
  leave_balance_unit,
  person_type,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { managerScopePersonIds } from "../settings/manager-scope";
import { hasActiveXeroConnection } from "../xero-connection-state";
import {
  type CurrentStatus,
  type CurrentStatusKey,
  computeCurrentStatus,
  computeCurrentStatusForPeople,
} from "./current-status";
import {
  type FieldOwnership,
  fieldOwnershipForPerson,
} from "./field-ownership";

export type PeopleRole = "admin" | "manager" | "owner" | "viewer";

export type PeopleServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "person_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface PeopleFilters {
  includeArchived: boolean;
  locationId?: string[];
  personType: "all" | "contractor" | "employee";
  search?: string;
  status?: CurrentStatusKey[];
  teamId?: string[];
  xeroLinked: "all" | "false" | "true";
  xeroSyncFailedOnly: boolean;
}

export interface PeoplePagination {
  cursor?: string | null;
  pageSize: number;
}

export interface PersonListItem {
  archivedAt: Date | null;
  avatarUrl: string | null;
  currentStatus: CurrentStatus;
  email: string;
  firstName: string;
  id: string;
  jobTitle: string | null;
  lastName: string;
  location: {
    countryCode: string | null;
    id: string;
    name: string;
    regionCode: string | null;
    timezone: string | null;
  } | null;
  manager: { displayName: string; id: string } | null;
  personType: person_type | "contractor" | "employee";
  team: { id: string; name: string } | null;
  xeroLinked: boolean;
  xeroSyncFailedCount: number;
}

export interface AvailabilityRecordSummary {
  allDay: boolean;
  approvalStatus: availability_approval_status;
  archivedAt: Date | null;
  contactabilityStatus: availability_contactability;
  endsAt: Date;
  id: string;
  privacyMode: availability_privacy_mode;
  recordType: availability_record_type;
  sourceType: availability_source_type;
  startsAt: Date;
  title: string | null;
  xeroWriteError: string | null;
}

export interface BalanceRow {
  balanceUnits: number;
  id: string;
  leaveTypeName: string | null;
  leaveTypeXeroId: string;
  recordType: availability_record_type | null;
  unitType: leave_balance_unit | null;
  xeroTenantId: string | null;
}

export interface AlternativeContactSnapshot {
  displayOrder: number;
  email: string | null;
  id: string;
  name: string;
  notes: string | null;
  phone: string | null;
  role: string | null;
}

export interface PersonProfile {
  alternativeContacts: AlternativeContactSnapshot[];
  balances: {
    balancesLastFetchedAt: Date | null;
    hasActiveXeroConnection: boolean;
    rows: BalanceRow[];
    xeroLinked: boolean;
  };
  currentStatus: CurrentStatus;
  fieldOwnership: FieldOwnership;
  header: {
    archivedAt: Date | null;
    avatarUrl: string | null;
    email: string;
    firstName: string;
    id: string;
    jobTitle: string | null;
    lastName: string;
    location: {
      countryCode: string | null;
      id: string;
      name: string;
      regionCode: string | null;
      timezone: string | null;
    } | null;
    manager: { firstName: string; id: string; lastName: string } | null;
    personType: person_type | "contractor" | "employee";
    startDate: Date | null;
    statusNote: string | null;
    team: { id: string; name: string } | null;
    xeroLinked: boolean;
  };
  upcomingRecords: AvailabilityRecordSummary[];
  xeroSyncFailedCount: number;
}

const RoleSchema = z.enum(["admin", "manager", "owner", "viewer"]);
const StatusSchema = z.enum([
  "alternative_contact",
  "another_office",
  "available",
  "client_site",
  "limited_availability",
  "offsite_meeting",
  "on_leave",
  "other",
  "pending_leave",
  "public_holiday",
  "training",
  "travelling",
  "wfh",
]);

const FiltersSchema = z
  .object({
    includeArchived: z.boolean().default(false),
    locationId: z.array(z.string().uuid()).optional(),
    personType: z.enum(["all", "contractor", "employee"]).default("all"),
    search: z.string().trim().max(200).optional(),
    status: z.array(StatusSchema).optional(),
    teamId: z.array(z.string().uuid()).optional(),
    xeroLinked: z.enum(["all", "false", "true"]).default("all"),
    xeroSyncFailedOnly: z.boolean().default(false),
  })
  .default({
    includeArchived: false,
    personType: "all",
    xeroLinked: "all",
    xeroSyncFailedOnly: false,
  });

const PaginationSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .default({ pageSize: 50 });

const ListPeopleSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  clerkOrgId: z.string().min(1),
  filters: FiltersSchema,
  organisationId: z.string().uuid(),
  pagination: PaginationSchema,
  role: RoleSchema.default("viewer"),
});

const PersonProfileSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  role: RoleSchema,
});

const HistorySchema = z.object({
  clerkOrgId: z.string().min(1),
  cursor: z.string().nullable().optional(),
  organisationId: z.string().uuid(),
  pageSize: z.number().int().min(1).max(100).default(25),
  personId: z.string().uuid(),
});

const UpcomingSchema = z.object({
  clerkOrgId: z.string().min(1),
  horizonDays: z.number().int().min(1).max(90).default(30),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});

export async function listPeople(input: {
  actingPersonId?: null | string;
  clerkOrgId: string;
  filters?: Partial<PeopleFilters>;
  organisationId: string;
  pagination?: Partial<PeoplePagination>;
  role?: PeopleRole;
}): Promise<
  Result<
    { nextCursor: string | null; people: PersonListItem[]; totalCount: number },
    PeopleServiceError
  >
> {
  const parsed = ListPeopleSchema.safeParse({
    ...input,
    filters: input.filters ?? {},
    pagination: input.pagination ?? {},
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const {
      actingPersonId,
      clerkOrgId,
      organisationId,
      filters,
      pagination,
      role,
    } = parsed.data;
    const scoped = scopedQuery(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId
    );
    const visiblePersonIds =
      role === "manager" && actingPersonId
        ? await managerScopePersonIds({
            actingPersonId,
            clerkOrgId,
            organisationId,
          })
        : null;
    const personWhere = buildPeopleWhere({
      filters,
      scoped,
      visiblePersonIds,
    });
    const cursor = decodePeopleCursor(pagination.cursor ?? null);
    const hasInMemoryFilters = Boolean(
      filters.status?.length || filters.xeroSyncFailedOnly
    );
    const people = await database.person.findMany({
      where: personWhere,
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
      select: personListSelect,
      ...(hasInMemoryFilters
        ? {}
        : {
            ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
            take: pagination.pageSize + 1,
          }),
    });
    const totalCount = hasInMemoryFilters
      ? null
      : await database.person.count({ where: personWhere });
    const failedCounts = await database.availabilityRecord.groupBy({
      by: ["person_id"],
      _count: { _all: true },
      where: {
        ...scoped,
        approval_status: "xero_sync_failed",
        person_id: { in: people.map((person) => person.id) },
      },
    });
    const failedCountByPersonId = new Map(
      failedCounts.map((row) => [row.person_id, row._count._all])
    );

    const currentStatusesByPersonId = await computeCurrentStatusForPeople({
      at: new Date(),
      clerkOrgId: scoped.clerk_org_id,
      organisationId: scoped.organisation_id,
      people: people.map((person) => ({
        locationId: person.location_id,
        personId: person.id,
      })),
    });
    const mapped = people.map((person) => {
      const currentStatus = currentStatusesByPersonId.get(person.id);
      if (!currentStatus) {
        throw new Error("Current status missing for person list item");
      }
      return toPersonListItem(
        person,
        currentStatus,
        failedCountByPersonId.get(person.id) ?? 0
      );
    });
    const filtered = mapped.filter((person) => {
      if (filters.xeroSyncFailedOnly && person.xeroSyncFailedCount === 0) {
        return false;
      }
      if (
        filters.status?.length &&
        !filters.status.includes(person.currentStatus.statusKey)
      ) {
        return false;
      }
      return true;
    });

    const afterCursor =
      cursor && hasInMemoryFilters
        ? filtered.filter((person) => comparePeopleCursor(person, cursor) > 0)
        : filtered;
    const page = afterCursor.slice(0, pagination.pageSize);
    const nextCursor =
      afterCursor.length > pagination.pageSize
        ? encodePeopleCursor(page.at(-1))
        : null;

    return {
      ok: true,
      value: {
        nextCursor,
        people: page,
        totalCount: totalCount ?? filtered.length,
      },
    };
  } catch {
    return unknownError("Failed to list people.");
  }
}

function buildPeopleWhere({
  filters,
  scoped,
  visiblePersonIds,
}: {
  filters: PeopleFilters;
  scoped: { clerk_org_id: ClerkOrgId; organisation_id: OrganisationId };
  visiblePersonIds: null | string[];
}): Prisma.PersonWhereInput {
  return {
    ...scoped,
    ...(filters.includeArchived ? {} : { archived_at: null }),
    ...(visiblePersonIds ? { id: { in: visiblePersonIds } } : {}),
    ...(filters.teamId?.length ? { team_id: { in: filters.teamId } } : {}),
    ...(filters.locationId?.length
      ? { location_id: { in: filters.locationId } }
      : {}),
    ...(filters.personType === "all"
      ? {}
      : { person_type: filters.personType }),
    ...(filters.xeroLinked === "true"
      ? { xero_employee_id: { not: null } }
      : {}),
    ...(filters.xeroLinked === "false" ? { xero_employee_id: null } : {}),
    ...(filters.xeroSyncFailedOnly
      ? {
          availability_records: {
            some: { ...scoped, approval_status: "xero_sync_failed" },
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            {
              first_name: { contains: filters.search, mode: "insensitive" },
            },
            {
              last_name: { contains: filters.search, mode: "insensitive" },
            },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function getPersonProfile(input: {
  actingPersonId?: null | string;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
  personId: string;
  role: PeopleRole;
}): Promise<Result<PersonProfile, PeopleServiceError>> {
  const parsed = PersonProfileSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  if (!RoleSchema.safeParse(parsed.data.role).success) {
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
      select: personProfileSelect,
    });
    if (!person) {
      return await personNotFoundOrLeak(parsed.data);
    }

    const [
      currentStatus,
      upcomingResult,
      balances,
      xeroSyncFailedCount,
      hasXero,
      alternativeContacts,
    ] = await Promise.all([
      computeCurrentStatus({
        at: new Date(),
        clerkOrgId: parsed.data.clerkOrgId,
        locationId: person.location_id,
        organisationId: parsed.data.organisationId,
        personId: person.id,
      }),
      listUpcomingRecords({
        clerkOrgId: parsed.data.clerkOrgId,
        horizonDays: 30,
        organisationId: parsed.data.organisationId,
        personId: person.id,
      }),
      database.leaveBalance.findMany({
        where: {
          ...scoped,
          person_id: person.id,
        },
        orderBy: [{ leave_type_name: "asc" }, { leave_type_xero_id: "asc" }],
        select: leaveBalanceProfileSelect,
      }),
      database.availabilityRecord.count({
        where: {
          ...scoped,
          approval_status: "xero_sync_failed",
          person_id: person.id,
        },
      }),
      hasActiveXeroConnection({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      }),
      database.alternativeContact.findMany({
        where: {
          ...scoped,
          person_id: person.id,
        },
        orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
        select: alternativeContactSelect,
      }),
    ]);

    const xeroLinked = Boolean(person.xero_employee_id);
    const visibleBalances = hasXero
      ? balances.filter((balance) => balance.xero_tenant_id !== null)
      : balances.filter((balance) => balance.xero_tenant_id === null);
    const balanceRows =
      (xeroLinked && hasXero) || !hasXero
        ? visibleBalances.map(toBalanceRow)
        : [];
    const balancesLastFetchedAt =
      xeroLinked && hasXero
        ? maxDate(visibleBalances.map((row) => row.last_fetched_at))
        : null;

    return {
      ok: true,
      value: {
        alternativeContacts: alternativeContacts.map(
          toAlternativeContactSnapshot
        ),
        balances: {
          balancesLastFetchedAt,
          hasActiveXeroConnection: hasXero,
          rows: balanceRows,
          xeroLinked,
        },
        currentStatus,
        fieldOwnership: fieldOwnershipForPerson({
          xeroEmployeeId: person.xero_employee_id,
        }),
        header: {
          archivedAt: person.archived_at,
          avatarUrl: person.avatar_url,
          email: person.email,
          firstName: person.first_name,
          id: person.id,
          jobTitle: person.job_title,
          lastName: person.last_name,
          location: person.location
            ? {
                countryCode: person.location.country_code,
                id: person.location.id,
                name: person.location.name,
                regionCode: person.location.region_code,
                timezone: person.location.timezone,
              }
            : null,
          manager: person.manager
            ? {
                firstName: person.manager.first_name,
                id: person.manager.id,
                lastName: person.manager.last_name,
              }
            : null,
          personType: effectivePersonType(
            person.person_type,
            person.employment_type
          ),
          startDate: person.start_date,
          statusNote: person.status_note,
          team: person.team,
          xeroLinked,
        },
        upcomingRecords: upcomingResult.ok ? upcomingResult.value.records : [],
        xeroSyncFailedCount,
      },
    };
  } catch {
    return unknownError("Failed to load this profile.");
  }
}

export async function listHistoryPage(input: {
  clerkOrgId: string;
  cursor?: null | string;
  organisationId: string;
  pageSize?: number;
  personId: string;
}): Promise<
  Result<
    { nextCursor: string | null; records: AvailabilityRecordSummary[] },
    PeopleServiceError
  >
> {
  const parsed = HistorySchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await database.person.findFirst({
      where: { ...scoped, id: parsed.data.personId },
      select: { id: true },
    });
    if (!person) {
      return await personNotFoundOrLeak(parsed.data);
    }

    const cursor = decodeDateCursor(parsed.data.cursor ?? null);
    const records = await database.availabilityRecord.findMany({
      where: {
        ...scoped,
        person_id: parsed.data.personId,
        starts_at: {
          lt: cursor?.startsAt ?? new Date(),
        },
      },
      orderBy: [{ starts_at: "desc" }, { id: "desc" }],
      select: availabilityRecordSelect,
      take: parsed.data.pageSize + 1,
    });
    const page = records
      .slice(0, parsed.data.pageSize)
      .map(toAvailabilityRecordSummary);
    const nextCursor =
      records.length > parsed.data.pageSize
        ? encodeDateCursor(page.at(-1))
        : null;

    return { ok: true, value: { nextCursor, records: page } };
  } catch {
    return unknownError("Failed to load history.");
  }
}

export async function listUpcomingRecords(input: {
  clerkOrgId: string;
  horizonDays?: number;
  organisationId: string;
  personId: string;
}): Promise<
  Result<{ records: AvailabilityRecordSummary[] }, PeopleServiceError>
> {
  const parsed = UpcomingSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await database.person.findFirst({
      where: { ...scoped, id: parsed.data.personId },
      select: { id: true },
    });
    if (!person) {
      return await personNotFoundOrLeak(parsed.data);
    }

    const now = new Date();
    const horizonEnd = new Date(now);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + parsed.data.horizonDays);
    const records = await database.availabilityRecord.findMany({
      where: {
        ...scoped,
        archived_at: null,
        approval_status: { in: ["approved", "submitted"] },
        person_id: parsed.data.personId,
        starts_at: {
          gte: now,
          lt: horizonEnd,
        },
      },
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      select: availabilityRecordSelect,
    });

    return {
      ok: true,
      value: { records: records.map(toAvailabilityRecordSummary) },
    };
  } catch {
    return unknownError("Failed to load upcoming records.");
  }
}

const personListSelect = {
  archived_at: true,
  avatar_url: true,
  email: true,
  employment_type: true,
  first_name: true,
  id: true,
  job_title: true,
  last_name: true,
  location_id: true,
  person_type: true,
  xero_employee_id: true,
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  manager: {
    select: {
      first_name: true,
      id: true,
      last_name: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const personProfileSelect = {
  ...personListSelect,
  start_date: true,
  status_note: true,
} as const;

const alternativeContactSelect = {
  display_order: true,
  email: true,
  id: true,
  name: true,
  notes: true,
  phone: true,
  role: true,
} as const;

const availabilityRecordSelect = {
  all_day: true,
  approval_status: true,
  archived_at: true,
  contactability: true,
  ends_at: true,
  id: true,
  privacy_mode: true,
  record_type: true,
  source_type: true,
  starts_at: true,
  title: true,
  xero_write_error: true,
} as const;

const leaveBalanceProfileSelect = {
  balance: true,
  balance_unit: true,
  id: true,
  last_fetched_at: true,
  leave_type_name: true,
  leave_type_xero_id: true,
  record_type: true,
  xero_tenant_id: true,
} satisfies Prisma.LeaveBalanceSelect;

type LeaveBalanceProfileRow = Prisma.LeaveBalanceGetPayload<{
  select: typeof leaveBalanceProfileSelect;
}>;

// Carry the raw stored leave type name (nullable). The fallback to the Xero id
// is a display concern applied in the UI and is never persisted, so opening the
// manual balance editor cannot silently turn a missing name into the id.
export function toBalanceRow(balance: LeaveBalanceProfileRow): BalanceRow {
  return {
    balanceUnits: Number(balance.balance),
    id: balance.id,
    leaveTypeName: balance.leave_type_name,
    leaveTypeXeroId: balance.leave_type_xero_id,
    recordType: balance.record_type,
    unitType: balance.balance_unit,
    xeroTenantId: balance.xero_tenant_id,
  };
}

function toPersonListItem(
  person: {
    archived_at: Date | null;
    avatar_url: string | null;
    email: string;
    employment_type: string;
    first_name: string;
    id: string;
    job_title: string | null;
    last_name: string;
    location: {
      country_code: string | null;
      id: string;
      name: string;
      region_code: string | null;
      timezone: string | null;
    } | null;
    location_id: string | null;
    manager: { first_name: string; id: string; last_name: string } | null;
    person_type: person_type | null;
    team: { id: string; name: string } | null;
    xero_employee_id: string | null;
  },
  currentStatus: CurrentStatus,
  xeroSyncFailedCount: number
): PersonListItem {
  return {
    archivedAt: person.archived_at,
    avatarUrl: person.avatar_url,
    currentStatus,
    email: person.email,
    firstName: person.first_name,
    id: person.id,
    jobTitle: person.job_title,
    lastName: person.last_name,
    location: person.location
      ? {
          countryCode: person.location.country_code,
          id: person.location.id,
          name: person.location.name,
          regionCode: person.location.region_code,
          timezone: person.location.timezone,
        }
      : null,
    manager: person.manager
      ? {
          displayName: `${person.manager.first_name} ${person.manager.last_name}`,
          id: person.manager.id,
        }
      : null,
    personType: effectivePersonType(person.person_type, person.employment_type),
    team: person.team,
    xeroLinked: Boolean(person.xero_employee_id),
    xeroSyncFailedCount,
  };
}

function toAvailabilityRecordSummary(record: {
  all_day: boolean;
  approval_status: availability_approval_status;
  archived_at: Date | null;
  contactability: availability_contactability;
  ends_at: Date;
  id: string;
  privacy_mode: availability_privacy_mode;
  record_type: availability_record_type;
  source_type: availability_source_type;
  starts_at: Date;
  title: string | null;
  xero_write_error: string | null;
}): AvailabilityRecordSummary {
  return {
    allDay: record.all_day,
    approvalStatus: record.approval_status,
    archivedAt: record.archived_at,
    contactabilityStatus: record.contactability,
    endsAt: record.ends_at,
    id: record.id,
    privacyMode: record.privacy_mode,
    recordType: record.record_type,
    sourceType: record.source_type,
    startsAt: record.starts_at,
    title: record.title,
    xeroWriteError: record.xero_write_error,
  };
}

function toAlternativeContactSnapshot(contact: {
  display_order: number;
  email: string | null;
  id: string;
  name: string;
  notes: string | null;
  phone: string | null;
  role: string | null;
}): AlternativeContactSnapshot {
  return {
    displayOrder: contact.display_order,
    email: contact.email,
    id: contact.id,
    name: contact.name,
    notes: contact.notes,
    phone: contact.phone,
    role: contact.role,
  };
}

function effectivePersonType(
  personType: null | person_type,
  employmentType: string
): person_type | "contractor" | "employee" {
  if (personType) {
    return personType;
  }
  return employmentType === "contractor" ? "contractor" : "employee";
}

interface PeopleCursor {
  firstName: string;
  id: string;
  lastName: string;
}

function comparePeopleCursor(person: PersonListItem, cursor: PeopleCursor) {
  const last = person.lastName.localeCompare(cursor.lastName);
  if (last !== 0) {
    return last;
  }
  const first = person.firstName.localeCompare(cursor.firstName);
  if (first !== 0) {
    return first;
  }
  return person.id.localeCompare(cursor.id);
}

function encodePeopleCursor(person: PersonListItem | undefined): string | null {
  if (!person) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({
      firstName: person.firstName,
      id: person.id,
      lastName: person.lastName,
    })
  ).toString("base64url");
}

function decodePeopleCursor(cursor: null | string): PeopleCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const parsed = z
      .object({
        firstName: z.string(),
        id: z.string(),
        lastName: z.string(),
      })
      .safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeDateCursor(
  record: AvailabilityRecordSummary | undefined
): string | null {
  if (!record) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({
      id: record.id,
      startsAt: record.startsAt.toISOString(),
    })
  ).toString("base64url");
}

function decodeDateCursor(
  cursor: null | string
): { id: string; startsAt: Date } | null {
  if (!cursor) {
    return null;
  }
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const parsed = z
      .object({
        id: z.string().uuid(),
        startsAt: z.coerce.date(),
      })
      .safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function maxDate(values: Array<Date | null>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }
    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }
    return latest;
  }, null);
}

async function personNotFoundOrLeak(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<never, PeopleServiceError>> {
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
    error: {
      code: "person_not_found",
      message: "Person not found.",
    },
  };
}

function validationError(error: z.ZodError): Result<never, PeopleServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid people request.",
    },
  };
}

function notAuthorised(): Result<never, PeopleServiceError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to view this profile.",
    },
  };
}

function unknownError(message: string): Result<never, PeopleServiceError> {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message,
    },
  };
}
