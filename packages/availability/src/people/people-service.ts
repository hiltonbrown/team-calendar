import { log } from "@repo/observability/log";
import "server-only";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import {
  assertTenantDb,
  resolveAccountCompanies,
  scopedQuery,
  type TenantDb,
} from "@repo/database";
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
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import {
  type CurrentStatus,
  type CurrentStatusKey,
  computeCurrentStatus,
  computeCurrentStatusForPeople,
  computePublicHolidayApplicability,
} from "./current-status";
import {
  type FieldOwnership,
  fieldOwnershipForPerson,
} from "./field-ownership";
export type PeopleRole = "admin" | "manager" | "owner" | "viewer";
export type PeopleServiceError =
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
  companyId: string;
  companyName: string;
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
  manager: {
    displayName: string;
    id: string;
  } | null;
  personType: person_type | "contractor" | "employee";
  team: {
    id: string;
    name: string;
  } | null;
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
  connectionId: string | null;
  currencyCode: string | null;
  id: string;
  leaveTypeName: string | null;
  leaveTypeXeroId: string;
  recordType: availability_record_type | null;
  unitType: leave_balance_unit | null;
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
    xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
    rows: BalanceRow[];
    xeroLinked: boolean;
  };
  currentStatus: CurrentStatus;
  fieldOwnership: FieldOwnership;
  header: {
    companyId: string;
    companyName: string;
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
    manager: {
      firstName: string;
      id: string;
      lastName: string;
    } | null;
    personType: person_type | "contractor" | "employee";
    startDate: Date | null;
    statusNote: string | null;
    team: {
      id: string;
      name: string;
    } | null;
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
  companyIds: z.array(z.string().uuid()).optional(),
  filters: FiltersSchema,
  organisationId: z.string().uuid().optional(),
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
  actingPersonId: z.string().uuid().nullable().optional(),
  clerkOrgId: z.string().min(1),
  cursor: z.string().nullable().optional(),
  organisationId: z.string().uuid(),
  pageSize: z.number().int().min(1).max(100).default(25),
  personId: z.string().uuid(),
  role: RoleSchema,
});
export async function canAccessPerson(
  input: {
    actingPersonId?: null | string;
    clerkOrgId: string;
    organisationId: string;
    personId: string;
    role: PeopleRole;
  },
  db: TenantDb
): Promise<boolean> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    if (input.role === "owner" || input.role === "admin") {
      return true;
    }
    if (!input.actingPersonId) {
      return false;
    }
    if (input.role === "viewer") {
      return input.actingPersonId === input.personId;
    }
    const visiblePersonIds = await managerScopePersonIds(
      {
        actingPersonId: input.actingPersonId,
        clerkOrgId: input.clerkOrgId,
      },
      client
    );
    return visiblePersonIds.includes(input.personId);
  }
}
const UpcomingSchema = z.object({
  clerkOrgId: z.string().min(1),
  horizonDays: z.number().int().min(1).max(90).default(30),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});
export async function listPeople(
  input: {
    actingPersonId?: null | string;
    clerkOrgId: string;
    filters?: Partial<PeopleFilters>;
    organisationId?: string;
    companyIds?: string[];
    pagination?: Partial<PeoplePagination>;
    role?: PeopleRole;
  },
  db: TenantDb
): Promise<
  Result<
    {
      nextCursor: string | null;
      people: PersonListItem[];
      totalCount: number;
    },
    PeopleServiceError
  >
> {
  assertTenantDb(db, input.clerkOrgId);
  const parsed = ListPeopleSchema.safeParse({
    ...input,
    filters: input.filters ?? {},
    pagination: input.pagination ?? {},
  });
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const { clerkOrgId, filters, pagination } = parsed.data;
    const companies = await resolveAccountCompanies(clerkOrgId, client);
    const selection = selectDirectoryCompanies(parsed.data, companies);
    if (!selection.ok) {
      return selection;
    }
    const selectedCompanies = selection.value;
    const scoped = {
      clerk_org_id: clerkOrgId,
      organisation_id: {
        in: selectedCompanies.map((company) => company.id),
      },
    };
    const visibility = await directoryVisibility(parsed.data, client);
    if (!visibility.ok) {
      return visibility;
    }
    const visiblePersonIds = visibility.value;
    if (visiblePersonIds?.length === 0) {
      return {
        ok: true,
        value: { nextCursor: null, people: [], totalCount: 0 },
      };
    }
    const at = new Date();
    const statusWhere = await directoryStatusWhere(
      {
        at,
        clerkOrgId,
        companies: selectedCompanies,
        statuses: filters.status ?? [],
      },
      client
    );
    const baseWhere = buildPeopleWhere({
      filters,
      scoped,
      visiblePersonIds,
    });
    const cursor = decodePeopleCursor(pagination.cursor ?? null);
    const personWhere: Prisma.PersonWhereInput = statusWhere
      ? { AND: [baseWhere, statusWhere] }
      : baseWhere;
    const people = await client.person.findMany({
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
      select: personListSelect,
      take: pagination.pageSize + 1,
      where: cursor
        ? { AND: [personWhere, peopleCursorWhere(cursor)] }
        : personWhere,
    });
    const totalCount = await client.person.count({
      where: personWhere,
    });
    const pageRows = people.slice(0, pagination.pageSize);
    const failedCounts = await client.availabilityRecord.groupBy({
      _count: { _all: true },
      by: ["person_id"],
      where: {
        ...scoped,
        approval_status: "xero_sync_failed",
        person_id: { in: pageRows.map((person) => person.id) },
      },
    });
    const failedCountByPersonId = new Map(
      failedCounts.map((row) => [row.person_id, row._count._all])
    );
    const currentStatusesByPersonId = new Map<string, CurrentStatus>();
    for (const company of selectedCompanies) {
      const statuses = await computeCurrentStatusForPeople(
        {
          at,
          clerkOrgId,
          organisationId: company.id,
          people: pageRows
            .filter((person) => person.organisation_id === company.id)
            .map((person) => ({
              locationId: person.location_id,
              personId: person.id,
            })),
        },
        client
      );
      for (const [personId, status] of statuses) {
        currentStatusesByPersonId.set(personId, status);
      }
    }
    const page = personDirectoryPage(
      pageRows,
      currentStatusesByPersonId,
      failedCountByPersonId
    );
    const nextCursor =
      people.length > pagination.pageSize
        ? encodePeopleCursor(page.at(-1))
        : null;
    return {
      ok: true,
      value: {
        nextCursor,
        people: page,
        totalCount,
      },
    };
  }
}
function buildPeopleWhere({
  filters,
  scoped,
  visiblePersonIds,
}: {
  filters: PeopleFilters;
  scoped: {
    clerk_org_id: string;
    organisation_id: { in: string[] };
  };
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
    ...(() => {
      const conditions: Prisma.PersonWhereInput[] = [];
      if (filters.personType !== "all") {
        conditions.push({
          OR: [
            { person_type: filters.personType },
            {
              employment_type:
                filters.personType === "contractor"
                  ? "contractor"
                  : { not: "contractor" },
              person_type: null,
            },
          ],
        });
      }
      if (filters.search) {
        conditions.push({
          OR: [
            {
              first_name: { contains: filters.search, mode: "insensitive" },
            },
            {
              last_name: { contains: filters.search, mode: "insensitive" },
            },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        });
      }
      if (conditions.length === 0) {
        return {};
      }
      if (conditions.length === 1) {
        return conditions[0] as Prisma.PersonWhereInput;
      }
      return { AND: conditions };
    })(),
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
  };
}
const LEAVE_TYPES: availability_record_type[] = [
  "annual_leave",
  "holiday",
  "long_service_leave",
  "personal_leave",
  "sick_leave",
  "unpaid_leave",
];
const LOCAL_RUNGS: Array<{
  key: CurrentStatusKey;
  types: availability_record_type[];
}> = [
  { key: "travelling", types: ["travelling"] },
  { key: "client_site", types: ["client_site"] },
  { key: "another_office", types: ["another_office"] },
  { key: "training", types: ["training"] },
  { key: "offsite_meeting", types: ["offsite_meeting"] },
  { key: "wfh", types: ["wfh"] },
  {
    key: "limited_availability",
    types: ["contractor_unavailable", "limited_availability"],
  },
  { key: "alternative_contact", types: ["alternative_contact"] },
  { key: "other", types: ["other"] },
];
async function buildCurrentStatusWhere(
  input: {
    at: Date;
    clerkOrgId: string;
    organisationId: string;
    statuses: NonNullable<DirectoryInput["filters"]["status"]>;
  },
  db: TenantDb
): Promise<Prisma.PersonWhereInput | null> {
  if (!input.statuses.length) {
    return null;
  }
  const scoped = scopedQuery(
    input.clerkOrgId as ClerkOrgId,
    input.organisationId as OrganisationId
  );
  const active = (
    types: availability_record_type[],
    status?: "approved" | "submitted"
  ): Prisma.AvailabilityRecordWhereInput => ({
    ...scoped,
    approval_status: status ?? { in: ["approved", "submitted"] },
    archived_at: null,
    ends_at: { gte: input.at },
    record_type: { in: types },
    starts_at: { lte: input.at },
  });
  const approved = active(LEAVE_TYPES, "approved");
  const pending = active(LEAVE_TYPES, "submitted");
  const locations = await db.location.findMany({
    select: { id: true },
    where: scoped,
  });
  const holidayApplicability = await computePublicHolidayApplicability(
    {
      at: input.at,
      clerkOrgId: input.clerkOrgId,
      locationIds: locations.map(({ id }) => id),
      organisationId: input.organisationId,
    },
    db
  );
  const applicableHolidayLocations: Prisma.PersonWhereInput[] = [
    ...(holidayApplicability.locationIds.size
      ? [{ location_id: { in: [...holidayApplicability.locationIds] } }]
      : []),
    ...(holidayApplicability.unassigned ? [{ location_id: null }] : []),
  ];
  // Prisma removes an empty OR while normalising relation predicates. Keep an
  // explicitly impossible predicate so `public_holiday` matches nobody and
  // `NOT holidayWhere` continues to match available/local-status people.
  const holidayWhere: Prisma.PersonWhereInput =
    applicableHolidayLocations.length
      ? { OR: applicableHolidayLocations }
      : { id: { in: [] } };
  const noLeave: Prisma.PersonWhereInput = {
    availability_records: { none: { OR: [approved, pending] } },
  };
  const predicates: Prisma.PersonWhereInput[] = [];
  for (const status of input.statuses) {
    if (status === "on_leave") {
      predicates.push({ availability_records: { some: approved } });
      continue;
    }
    if (status === "pending_leave") {
      predicates.push({
        AND: [
          { availability_records: { none: approved } },
          { availability_records: { some: pending } },
        ],
      });
      continue;
    }
    if (status === "public_holiday") {
      predicates.push({ AND: [noLeave, holidayWhere] });
      continue;
    }
    const index = LOCAL_RUNGS.findIndex(({ key }) => key === status);
    if (index >= 0) {
      const higher = LOCAL_RUNGS.slice(0, index).flatMap(({ types }) => types);
      predicates.push({
        AND: [
          noLeave,
          { NOT: holidayWhere },
          ...(higher.length
            ? [{ availability_records: { none: active(higher) } }]
            : []),
          {
            availability_records: {
              some: active(LOCAL_RUNGS[index]?.types ?? []),
            },
          },
        ],
      });
    } else if (status === "available") {
      predicates.push({
        AND: [
          noLeave,
          { NOT: holidayWhere },
          {
            availability_records: {
              none: active(LOCAL_RUNGS.flatMap(({ types }) => types)),
            },
          },
        ],
      });
    }
  }
  return predicates.length ? { OR: predicates } : { id: { in: [] } };
}
function peopleCursorWhere(cursor: PeopleCursor): Prisma.PersonWhereInput {
  return {
    OR: [
      { last_name: { gt: cursor.lastName } },
      { first_name: { gt: cursor.firstName }, last_name: cursor.lastName },
      {
        first_name: cursor.firstName,
        id: { gt: cursor.id },
        last_name: cursor.lastName,
      },
    ],
  };
}
export async function getPersonProfile(
  input: {
    actingPersonId?: null | string;
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
    personId: string;
    role: PeopleRole;
  },
  db: TenantDb
): Promise<Result<PersonProfile, PeopleServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const parsed = PersonProfileSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    if (!RoleSchema.safeParse(parsed.data.role).success) {
      return notAuthorised();
    }
    if (!(await canAccessPerson(parsed.data, client))) {
      return notAuthorised();
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await client.person.findFirst({
      select: personProfileSelect,
      where: {
        ...scoped,
        id: parsed.data.personId,
      },
    });
    if (!person) {
      return await personNotFound(parsed.data, client);
    }
    const [
      currentStatus,
      upcomingResult,
      balances,
      xeroSyncFailedCount,
      xeroStateResult,
      alternativeContacts,
    ] = [
      await computeCurrentStatus(
        {
          at: new Date(),
          clerkOrgId: parsed.data.clerkOrgId,
          locationId: person.location_id,
          organisationId: parsed.data.organisationId,
          personId: person.id,
        },
        client
      ),
      await listUpcomingRecords(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          horizonDays: 30,
          organisationId: parsed.data.organisationId,
          personId: person.id,
        },
        client
      ),
      await client.leaveBalance.findMany({
        orderBy: [{ leave_type_name: "asc" }, { leave_type_xero_id: "asc" }],
        select: leaveBalanceProfileSelect,
        where: {
          ...scoped,
          person_id: person.id,
        },
      }),
      await client.availabilityRecord.count({
        where: {
          ...scoped,
          approval_status: "xero_sync_failed",
          person_id: person.id,
        },
      }),
      await getXeroConnectionStateForScope(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        },
        client
      ),
      await client.alternativeContact.findMany({
        orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
        select: alternativeContactSelect,
        where: {
          ...scoped,
          person_id: person.id,
        },
      }),
    ];
    const xeroConnectionState = xeroStateResult.ok
      ? xeroStateResult.value.state
      : "unavailable";
    const hasXero = xeroConnectionState !== "not_connected";
    const xeroLinked = Boolean(person.xero_employee_id);
    const visibleBalances = hasXero
      ? balances.filter((balance) => balance.xero_connection_id !== null)
      : balances.filter((balance) => balance.xero_connection_id === null);
    const balanceRows =
      xeroLinked || !hasXero ? visibleBalances.map(toBalanceRow) : [];
    const balancesLastFetchedAt = hasXero
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
          rows: balanceRows,
          xeroConnectionState,
          xeroLinked,
        },
        currentStatus,
        fieldOwnership: fieldOwnershipForPerson({
          xeroEmployeeId: person.xero_employee_id,
        }),
        header: personProfileHeader(person, xeroLinked),
        upcomingRecords: upcomingResult.ok ? upcomingResult.value.records : [],
        xeroSyncFailedCount,
      },
    };
  }
}
export async function listHistoryPage(
  input: {
    actingPersonId?: null | string;
    clerkOrgId: string;
    cursor?: null | string;
    organisationId: string;
    pageSize?: number;
    personId: string;
    role: PeopleRole;
  },
  db: TenantDb
): Promise<
  Result<
    {
      nextCursor: string | null;
      records: AvailabilityRecordSummary[];
    },
    PeopleServiceError
  >
> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const parsed = HistorySchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    if (!(await canAccessPerson(parsed.data, client))) {
      return notAuthorised();
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await client.person.findFirst({
      select: { id: true },
      where: { ...scoped, id: parsed.data.personId },
    });
    if (!person) {
      return await personNotFound(parsed.data, client);
    }
    const cursor = decodeDateCursor(parsed.data.cursor ?? null);
    const records = await client.availabilityRecord.findMany({
      orderBy: [{ starts_at: "desc" }, { id: "desc" }],
      select: availabilityRecordSelect,
      take: parsed.data.pageSize + 1,
      where: {
        ...scoped,
        person_id: parsed.data.personId,
        starts_at: {
          lt: cursor?.startsAt ?? new Date(),
        },
      },
    });
    const page = records
      .slice(0, parsed.data.pageSize)
      .map(toAvailabilityRecordSummary);
    const nextCursor =
      records.length > parsed.data.pageSize
        ? encodeDateCursor(page.at(-1))
        : null;
    return { ok: true, value: { nextCursor, records: page } };
  }
}
export async function listUpcomingRecords(
  input: {
    clerkOrgId: string;
    horizonDays?: number;
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<
  Result<
    {
      records: AvailabilityRecordSummary[];
    },
    PeopleServiceError
  >
> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const parsed = UpcomingSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await client.person.findFirst({
      select: { id: true },
      where: { ...scoped, id: parsed.data.personId },
    });
    if (!person) {
      return await personNotFound(parsed.data, client);
    }
    const now = new Date();
    const horizonEnd = new Date(now);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + parsed.data.horizonDays);
    const records = await client.availabilityRecord.findMany({
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      select: availabilityRecordSelect,
      where: {
        ...scoped,
        approval_status: { in: ["approved", "submitted"] },
        archived_at: null,
        person_id: parsed.data.personId,
        starts_at: {
          gte: now,
          lt: horizonEnd,
        },
      },
    });
    return {
      ok: true,
      value: { records: records.map(toAvailabilityRecordSummary) },
    };
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
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  location_id: true,
  manager: {
    select: {
      first_name: true,
      id: true,
      last_name: true,
    },
  },
  organisation: { select: { id: true, name: true } },
  organisation_id: true,
  person_type: true,
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  xero_employee_id: true,
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
  currency_code: true,
  id: true,
  last_fetched_at: true,
  leave_type_name: true,
  leave_type_xero_id: true,
  record_type: true,
  xero_connection_id: true,
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
    connectionId: balance.xero_connection_id,
    currencyCode: balance.currency_code,
    id: balance.id,
    leaveTypeName: balance.leave_type_name,
    leaveTypeXeroId: balance.leave_type_xero_id,
    recordType: balance.record_type,
    unitType: balance.balance_unit,
  };
}
function toPersonListItem(
  person: {
    organisation_id: string;
    organisation: { name: string };
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
    manager: {
      first_name: string;
      id: string;
      last_name: string;
    } | null;
    person_type: person_type | null;
    team: {
      id: string;
      name: string;
    } | null;
    xero_employee_id: string | null;
  },
  currentStatus: CurrentStatus,
  xeroSyncFailedCount: number
): PersonListItem {
  return {
    archivedAt: person.archived_at,
    avatarUrl: person.avatar_url,
    companyId: person.organisation_id,
    companyName: person.organisation.name,
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
function decodeDateCursor(cursor: null | string): {
  id: string;
  startsAt: Date;
} | null {
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
async function personNotFound(
  input: {
    clerkOrgId: string;
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<Result<never, PeopleServiceError>> {
  const exists = await db.person.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { clerk_org_id: input.clerkOrgId, id: input.personId },
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
    error: {
      code: "person_not_found",
      message: "Person not found.",
    },
    ok: false,
  };
}
function validationError(error: z.ZodError): Result<never, PeopleServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid people request.",
    },
    ok: false,
  };
}
function notAuthorised(): Result<never, PeopleServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to view this profile.",
    },
    ok: false,
  };
}

type DirectoryInput = z.infer<typeof ListPeopleSchema>;
type DirectoryCompanies = Awaited<ReturnType<typeof resolveAccountCompanies>>;
function selectDirectoryCompanies(
  input: DirectoryInput,
  companies: DirectoryCompanies
): Result<DirectoryCompanies, PeopleServiceError> {
  const ids =
    input.companyIds ??
    (input.organisationId ? [input.organisationId] : undefined);
  if (ids?.some((id) => !companies.some((company) => company.id === id))) {
    return {
      error: {
        code: "validation_error",
        message: "Company filter is invalid.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: ids
      ? companies.filter((company) => ids.includes(company.id))
      : companies,
  };
}
async function directoryVisibility(
  input: DirectoryInput,
  db: TenantDb
): Promise<Result<string[] | null, PeopleServiceError>> {
  if (input.role === "viewer") {
    return {
      ok: true,
      value: input.actingPersonId ? [input.actingPersonId] : [],
    };
  }
  if (input.role !== "manager") {
    return { ok: true, value: null };
  }
  if (!input.actingPersonId) {
    return notAuthorised();
  }
  const value = await managerScopePersonIds(
    { actingPersonId: input.actingPersonId, clerkOrgId: input.clerkOrgId },
    db
  );
  return { ok: true, value };
}
async function directoryStatusWhere(
  input: {
    at: Date;
    clerkOrgId: string;
    companies: DirectoryCompanies;
    statuses: NonNullable<DirectoryInput["filters"]["status"]>;
  },
  db: TenantDb
): Promise<Prisma.PersonWhereInput | null> {
  if (!input.statuses.length) {
    return null;
  }
  const branches: Prisma.PersonWhereInput[] = [];
  for (const company of input.companies) {
    const branch = await buildCurrentStatusWhere(
      {
        at: input.at,
        clerkOrgId: input.clerkOrgId,
        organisationId: company.id,
        statuses: input.statuses,
      },
      db
    );
    if (branch) {
      branches.push({ AND: [{ organisation_id: company.id }, branch] });
    }
  }
  return { OR: branches };
}

function personDirectoryPage(
  rows: Prisma.PersonGetPayload<{ select: typeof personListSelect }>[],
  statuses: Map<string, CurrentStatus>,
  failedCounts: Map<string, number>
) {
  return rows.map((person) => {
    const currentStatus = statuses.get(person.id);
    if (!currentStatus) {
      throw new Error("Current status missing for person list item");
    }
    return toPersonListItem(
      person,
      currentStatus,
      failedCounts.get(person.id) ?? 0
    );
  });
}

function personProfileHeader(
  person: Prisma.PersonGetPayload<{ select: typeof personProfileSelect }>,
  xeroLinked: boolean
) {
  return {
    archivedAt: person.archived_at,
    avatarUrl: person.avatar_url,
    companyId: person.organisation_id,
    companyName: person.organisation.name,
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
    personType: effectivePersonType(person.person_type, person.employment_type),
    startDate: person.start_date,
    statusNote: person.status_note,
    team: person.team,
    xeroLinked,
  };
}
