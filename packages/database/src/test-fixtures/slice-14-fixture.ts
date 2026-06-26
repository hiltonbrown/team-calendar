export type Slice14ApprovalStatus =
  | "approved"
  | "declined"
  | "draft"
  | "submitted"
  | "withdrawn"
  | "xero_sync_failed";

export type Slice14SourceType = "team_calendar_leave" | "manual" | "xero_leave";

export interface Slice14OrganisationFixture {
  clerkOrgId: string;
  countryCode: "AU" | "NZ";
  id: string;
  name: string;
}

export interface Slice14PersonFixture {
  clerkOrgId: string;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  locationId: string;
  organisationId: string;
  teamId: string;
  userId: string;
}

export interface Slice14AvailabilityRecordFixture {
  approvalStatus: Slice14ApprovalStatus;
  clerkOrgId: string;
  failedAction: "approve" | "decline" | "submit" | "withdraw" | null;
  id: string;
  organisationId: string;
  personId: string;
  recordType: string;
  sourceType: Slice14SourceType;
}

export interface Slice14Fixture {
  auditEvents: Array<{
    action: string;
    clerkOrgId: string;
    organisationId: string;
  }>;
  availabilityRecords: Slice14AvailabilityRecordFixture[];
  failedRecords: Array<{ id: string; rawPayload: Record<string, unknown> }>;
  feeds: Array<{
    id: string;
    organisationId: string;
    privacyMode: "masked" | "named" | "private";
    status: "active" | "archived" | "paused";
  }>;
  locations: Array<{ id: string; name: string; organisationId: string }>;
  notifications: Array<{
    organisationId: string;
    type: string;
    userId: string;
  }>;
  organisations: Slice14OrganisationFixture[];
  people: Slice14PersonFixture[];
  publicHolidayImports: Array<{
    countryCode: string;
    id: string;
    organisationId: string;
  }>;
  syncRuns: Array<{
    id: string;
    organisationId: string;
    status: "failed" | "partial_success" | "succeeded";
  }>;
  teams: Array<{ id: string; name: string; organisationId: string }>;
  xeroTenants: Array<{
    id: string;
    organisationId: string;
    tenantName: string;
  }>;
}

const CLERK_ORG_A = "org_a";
const CLERK_ORG_B = "org_b";
const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b1";

const STATUS_CYCLE: Slice14ApprovalStatus[] = [
  "draft",
  "submitted",
  "approved",
  "declined",
  "withdrawn",
  "xero_sync_failed",
];
const SOURCE_CYCLE: Slice14SourceType[] = [
  "team_calendar_leave",
  "manual",
  "xero_leave",
];
const RECORD_TYPE_CYCLE = [
  "annual_leave",
  "personal_leave",
  "wfh",
  "training",
  "client_site",
  "travelling",
];

export function createSlice14Fixture(): Slice14Fixture {
  const organisations: Slice14OrganisationFixture[] = [
    {
      clerkOrgId: CLERK_ORG_A,
      countryCode: "AU",
      id: ORG_A,
      name: "Team Calendar Fixture A",
    },
    {
      clerkOrgId: CLERK_ORG_B,
      countryCode: "NZ",
      id: ORG_B,
      name: "Team Calendar Fixture B",
    },
  ];

  const teams = createOrgRows(3, "team", (index, organisationId) => ({
    id: fixtureId("100", index),
    name: `Team ${index + 1}`,
    organisationId,
  }));
  const locations = createOrgRows(2, "location", (index, organisationId) => ({
    id: fixtureId("200", index),
    name: index % 2 === 0 ? "Brisbane" : "Auckland",
    organisationId,
  }));
  const people = Array.from({ length: 30 }, (_, index) => {
    const organisation = organisations[index < 15 ? 0 : 1];
    const team = teams.filter((row) => row.organisationId === organisation.id)[
      index % 3
    ];
    const location = locations.filter(
      (row) => row.organisationId === organisation.id
    )[index % 2];
    return {
      clerkOrgId: organisation.clerkOrgId,
      email: `person${index + 1}@teamcalendar.test`,
      firstName: `Person${index + 1}`,
      id: fixtureId("300", index),
      lastName: "Fixture",
      locationId: location?.id ?? fixtureId("200", 0),
      organisationId: organisation.id,
      teamId: team?.id ?? fixtureId("100", 0),
      userId: `user_${index + 1}`,
    };
  });

  return {
    auditEvents: createAuditEvents(organisations),
    availabilityRecords: createAvailabilityRecords(people),
    failedRecords: [
      { id: fixtureId("900", 1), rawPayload: { reason: "fixture" } },
      { id: fixtureId("900", 2), rawPayload: { reason: "fixture" } },
    ],
    feeds: Array.from({ length: 10 }, (_, index) => {
      const organisation = organisations[index < 5 ? 0 : 1];
      return {
        id: fixtureId("500", index),
        organisationId: organisation.id,
        privacyMode: privacyModeFor(index),
        status: feedStatusFor(index),
      };
    }),
    locations,
    notifications: notificationTypes().map((type, index) => ({
      organisationId: index % 2 === 0 ? ORG_A : ORG_B,
      type,
      userId: `user_${index + 1}`,
    })),
    organisations,
    people,
    publicHolidayImports: [
      { countryCode: "AU", id: fixtureId("600", 1), organisationId: ORG_A },
      { countryCode: "NZ", id: fixtureId("600", 2), organisationId: ORG_B },
    ],
    syncRuns: [
      { id: fixtureId("700", 1), organisationId: ORG_A, status: "succeeded" },
      {
        id: fixtureId("700", 2),
        organisationId: ORG_A,
        status: "partial_success",
      },
      { id: fixtureId("700", 3), organisationId: ORG_B, status: "failed" },
    ],
    teams,
    xeroTenants: [
      { id: fixtureId("800", 1), organisationId: ORG_A, tenantName: "AU One" },
      { id: fixtureId("800", 2), organisationId: ORG_A, tenantName: "AU Two" },
      { id: fixtureId("800", 3), organisationId: ORG_B, tenantName: "NZ One" },
    ],
  };
}

function createOrgRows<T>(
  countPerOrg: number,
  _kind: string,
  factory: (index: number, organisationId: string) => T
): T[] {
  return [ORG_A, ORG_B].flatMap((organisationId, orgIndex) =>
    Array.from({ length: countPerOrg }, (_, index) =>
      factory(index + orgIndex * countPerOrg, organisationId)
    )
  );
}

function createAvailabilityRecords(
  people: Slice14PersonFixture[]
): Slice14AvailabilityRecordFixture[] {
  return Array.from({ length: 200 }, (_, index) => {
    const person = people[index % people.length];
    const approvalStatus = STATUS_CYCLE[index % STATUS_CYCLE.length];
    return {
      approvalStatus,
      clerkOrgId: person?.clerkOrgId ?? CLERK_ORG_A,
      failedAction:
        approvalStatus === "xero_sync_failed" ? failedActionFor(index) : null,
      id: fixtureId("400", index),
      organisationId: person?.organisationId ?? ORG_A,
      personId: person?.id ?? fixtureId("300", 0),
      recordType:
        RECORD_TYPE_CYCLE[index % RECORD_TYPE_CYCLE.length] ?? "other",
      sourceType: SOURCE_CYCLE[index % SOURCE_CYCLE.length] ?? "manual",
    };
  });
}

function createAuditEvents(organisations: Slice14OrganisationFixture[]) {
  const actions = [
    "availability_records.created",
    "availability_records.approved",
    "availability_records.declined",
    "feeds.created",
    "feeds.token_rotated",
    "public_holidays.imported",
    "sync.manual_dispatched",
    "analytics.leave_reports_exported",
    "organisation_settings.updated",
    "billing.viewed",
  ];
  return actions.map((action, index) => {
    const organisation = organisations[index % organisations.length];
    return {
      action,
      clerkOrgId: organisation?.clerkOrgId ?? CLERK_ORG_A,
      organisationId: organisation?.id ?? ORG_A,
    };
  });
}

function failedActionFor(index: number) {
  const values = ["submit", "approve", "decline", "withdraw"] as const;
  return values[index % values.length] ?? "submit";
}

function feedStatusFor(index: number) {
  const values = ["active", "paused", "archived"] as const;
  return values[index % values.length] ?? "active";
}

function privacyModeFor(index: number) {
  const values = ["named", "masked", "private"] as const;
  return values[index % values.length] ?? "named";
}

function notificationTypes() {
  return [
    "leave_approved",
    "leave_declined",
    "leave_info_requested",
    "missing_alternative_contact",
    "leave_submitted",
    "leave_withdrawn",
    "leave_xero_sync_failed",
    "sync_reconciliation_complete",
    "sync_failed",
    "feed_token_rotated",
    "privacy_conflict",
  ];
}

function fixtureId(prefix: string, index: number): string {
  return `00000000-0000-4000-8000-${prefix}${String(index).padStart(9, "0")}`;
}
