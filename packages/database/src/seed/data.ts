import {
  type employment_type,
  type person_type,
  source_system,
} from "../../generated/client";

/**
 * Declarative development seed dataset.
 *
 * Every row except `clerk_org_id` is described here; the seed runner injects the
 * resolved `clerk_org_id` so the tenancy key is applied centrally and uniformly.
 *
 * Identifiers are fixed UUIDs so the seed is idempotent: organisations, teams and
 * locations upsert on `id`, while people upsert on the natural key
 * (organisation_id, source_system, source_person_key). Re-running never duplicates.
 *
 * The data is realistic Australian sample data for a single Clerk Organisation
 * spanning two payroll entities. It seeds canonical data only. No Xero tokens,
 * connections or other secrets are present.
 */

export interface PersonSeed {
  email: string;
  employment_type: (typeof employment_type)[keyof typeof employment_type];
  first_name: string;
  id: string;
  job_title: string;
  last_name: string;
  location_id: string;
  manager_person_id: string | null;
  person_type: (typeof person_type)[keyof typeof person_type];
  source_person_key: string;
  source_system: (typeof source_system)[keyof typeof source_system];
  team_id: string;
  xero_employee_id: string | null;
}

export interface TeamSeed {
  id: string;
  name: string;
}

export interface LocationSeed {
  country_code: string;
  id: string;
  name: string;
  region_code: string;
  timezone: string;
}

export interface OrganisationSeed {
  country_code: string;
  id: string;
  locations: LocationSeed[];
  name: string;
  people: PersonSeed[];
  region_code: string;
  teams: TeamSeed[];
  timezone: string;
}

/** Default Clerk Organisation id used when SEED_CLERK_ORG_ID is not provided. */
export const DEFAULT_SEED_CLERK_ORG_ID = "org_dev_leavesync";

// Acme Restaurants Pty Ltd (Queensland payroll entity).
const ORG_RESTAURANTS_ID = "a1000000-0000-4000-8000-000000000001";
const TEAM_OPERATIONS_ID = "b1000000-0000-4000-8000-000000000001";
const TEAM_FRONT_OF_HOUSE_ID = "b1000000-0000-4000-8000-000000000002";
const LOCATION_BRISBANE_ID = "c1000000-0000-4000-8000-000000000001";
const LOCATION_GOLD_COAST_ID = "c1000000-0000-4000-8000-000000000002";
const PERSON_SARAH_ID = "d1000000-0000-4000-8000-000000000001";
const PERSON_LIAM_ID = "d1000000-0000-4000-8000-000000000002";
const PERSON_PRIYA_ID = "d1000000-0000-4000-8000-000000000003";
const PERSON_JAMES_ID = "d1000000-0000-4000-8000-000000000004";

// Acme Hotels Pty Ltd (New South Wales payroll entity).
const ORG_HOTELS_ID = "a2000000-0000-4000-8000-000000000001";
const TEAM_HOUSEKEEPING_ID = "b2000000-0000-4000-8000-000000000001";
const LOCATION_SYDNEY_ID = "c2000000-0000-4000-8000-000000000001";
const PERSON_MIA_ID = "d2000000-0000-4000-8000-000000000001";
const PERSON_NOAH_ID = "d2000000-0000-4000-8000-000000000002";

export const seedOrganisations: OrganisationSeed[] = [
  {
    id: ORG_RESTAURANTS_ID,
    name: "Acme Restaurants Pty Ltd",
    country_code: "AU",
    region_code: "QLD",
    timezone: "Australia/Brisbane",
    teams: [
      { id: TEAM_OPERATIONS_ID, name: "Operations" },
      { id: TEAM_FRONT_OF_HOUSE_ID, name: "Front of House" },
    ],
    locations: [
      {
        id: LOCATION_BRISBANE_ID,
        name: "Brisbane CBD",
        country_code: "AU",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
      {
        id: LOCATION_GOLD_COAST_ID,
        name: "Gold Coast",
        country_code: "AU",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
    ],
    // Managers are listed before their reports so the self-referential FK resolves
    // on first insert.
    people: [
      {
        id: PERSON_SARAH_ID,
        source_system: source_system.XERO,
        source_person_key: "xero-emp-001",
        first_name: "Sarah",
        last_name: "Nguyen",
        email: "sarah.nguyen@acmerestaurants.example",
        job_title: "Operations Manager",
        employment_type: "employee",
        person_type: "employee",
        team_id: TEAM_OPERATIONS_ID,
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: null,
        xero_employee_id: "XERO-EMP-001",
      },
      {
        id: PERSON_LIAM_ID,
        source_system: source_system.XERO,
        source_person_key: "xero-emp-002",
        first_name: "Liam",
        last_name: "O'Brien",
        email: "liam.obrien@acmerestaurants.example",
        job_title: "Shift Supervisor",
        employment_type: "employee",
        person_type: "employee",
        team_id: TEAM_OPERATIONS_ID,
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: PERSON_SARAH_ID,
        xero_employee_id: "XERO-EMP-002",
      },
      {
        id: PERSON_PRIYA_ID,
        source_system: source_system.MANUAL,
        source_person_key: "manual-001",
        first_name: "Priya",
        last_name: "Sharma",
        email: "priya.sharma@acmerestaurants.example",
        job_title: "Events Coordinator",
        employment_type: "contractor",
        person_type: "contractor",
        team_id: TEAM_FRONT_OF_HOUSE_ID,
        location_id: LOCATION_GOLD_COAST_ID,
        manager_person_id: PERSON_SARAH_ID,
        xero_employee_id: null,
      },
      {
        id: PERSON_JAMES_ID,
        source_system: source_system.XERO,
        source_person_key: "xero-emp-003",
        first_name: "James",
        last_name: "Wilson",
        email: "james.wilson@acmerestaurants.example",
        job_title: "Managing Director",
        employment_type: "director",
        person_type: "director",
        team_id: TEAM_OPERATIONS_ID,
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: null,
        xero_employee_id: "XERO-EMP-003",
      },
    ],
  },
  {
    id: ORG_HOTELS_ID,
    name: "Acme Hotels Pty Ltd",
    country_code: "AU",
    region_code: "NSW",
    timezone: "Australia/Sydney",
    teams: [{ id: TEAM_HOUSEKEEPING_ID, name: "Housekeeping" }],
    locations: [
      {
        id: LOCATION_SYDNEY_ID,
        name: "Sydney CBD",
        country_code: "AU",
        region_code: "NSW",
        timezone: "Australia/Sydney",
      },
    ],
    people: [
      {
        id: PERSON_MIA_ID,
        source_system: source_system.XERO,
        source_person_key: "xero-emp-101",
        first_name: "Mia",
        last_name: "Roberts",
        email: "mia.roberts@acmehotels.example",
        job_title: "Housekeeping Manager",
        employment_type: "employee",
        person_type: "employee",
        team_id: TEAM_HOUSEKEEPING_ID,
        location_id: LOCATION_SYDNEY_ID,
        manager_person_id: null,
        xero_employee_id: "XERO-EMP-101",
      },
      {
        id: PERSON_NOAH_ID,
        source_system: source_system.MANUAL,
        source_person_key: "manual-101",
        first_name: "Noah",
        last_name: "Chen",
        email: "noah.chen@acmehotels.example",
        job_title: "Reservations Specialist",
        employment_type: "offshore",
        person_type: "offshore_staff",
        team_id: TEAM_HOUSEKEEPING_ID,
        location_id: LOCATION_SYDNEY_ID,
        manager_person_id: PERSON_MIA_ID,
        xero_employee_id: null,
      },
    ],
  },
];
