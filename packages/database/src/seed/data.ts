import {
  type employment_type,
  type person_type,
  source_system,
} from "../../generated/client";

/**
 * Declarative development seed dataset.
 *
 * Every row except `account_id` is described here; the seed runner injects the
 * resolved `account_id` so the tenancy key is applied centrally and uniformly.
 *
 * Identifiers are fixed UUIDs so the seed is idempotent: organisations, teams and
 * locations upsert on `id`, while people upsert on the natural key
 * (organisation_id, source_system, source_person_key). Re-running never duplicates.
 *
 * The data is realistic Australian sample data for a single Account
 * spanning two payroll entities. It seeds canonical data only. No Xero tokens,
 * connections or other secrets are present.
 */

export interface PersonSeed {
  email: string;
  employment_type: employment_type;
  first_name: string;
  id: string;
  job_title: string;
  last_name: string;
  location_id: string;
  manager_person_id: string | null;
  person_type: person_type;
  source_person_key: string;
  source_system: source_system;
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

/** Default Account id used when SEED_ACCOUNT_ID is not provided. */
export const DEFAULT_SEED_ACCOUNT_ID = "org_dev_teamcalendar";

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
    country_code: "AU",
    id: ORG_RESTAURANTS_ID,
    locations: [
      {
        country_code: "AU",
        id: LOCATION_BRISBANE_ID,
        name: "Brisbane CBD",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
      {
        country_code: "AU",
        id: LOCATION_GOLD_COAST_ID,
        name: "Gold Coast",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
    ],
    name: "Acme Restaurants Pty Ltd",
    // Managers are listed before their reports so the self-referential FK resolves
    // on first insert.
    people: [
      {
        email: "sarah.nguyen@acmerestaurants.example",
        employment_type: "employee",
        first_name: "Sarah",
        id: PERSON_SARAH_ID,
        job_title: "Operations Manager",
        last_name: "Nguyen",
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: null,
        person_type: "employee",
        source_person_key: "xero-emp-001",
        source_system: source_system.XERO,
        team_id: TEAM_OPERATIONS_ID,
        xero_employee_id: "XERO-EMP-001",
      },
      {
        email: "liam.obrien@acmerestaurants.example",
        employment_type: "employee",
        first_name: "Liam",
        id: PERSON_LIAM_ID,
        job_title: "Shift Supervisor",
        last_name: "O'Brien",
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: PERSON_SARAH_ID,
        person_type: "employee",
        source_person_key: "xero-emp-002",
        source_system: source_system.XERO,
        team_id: TEAM_OPERATIONS_ID,
        xero_employee_id: "XERO-EMP-002",
      },
      {
        email: "priya.sharma@acmerestaurants.example",
        employment_type: "contractor",
        first_name: "Priya",
        id: PERSON_PRIYA_ID,
        job_title: "Events Coordinator",
        last_name: "Sharma",
        location_id: LOCATION_GOLD_COAST_ID,
        manager_person_id: PERSON_SARAH_ID,
        person_type: "contractor",
        source_person_key: "manual-001",
        source_system: source_system.MANUAL,
        team_id: TEAM_FRONT_OF_HOUSE_ID,
        xero_employee_id: null,
      },
      {
        email: "james.wilson@acmerestaurants.example",
        employment_type: "director",
        first_name: "James",
        id: PERSON_JAMES_ID,
        job_title: "Managing Director",
        last_name: "Wilson",
        location_id: LOCATION_BRISBANE_ID,
        manager_person_id: null,
        person_type: "director",
        source_person_key: "xero-emp-003",
        source_system: source_system.XERO,
        team_id: TEAM_OPERATIONS_ID,
        xero_employee_id: "XERO-EMP-003",
      },
    ],
    region_code: "QLD",
    teams: [
      { id: TEAM_OPERATIONS_ID, name: "Operations" },
      { id: TEAM_FRONT_OF_HOUSE_ID, name: "Front of House" },
    ],
    timezone: "Australia/Brisbane",
  },
  {
    country_code: "AU",
    id: ORG_HOTELS_ID,
    locations: [
      {
        country_code: "AU",
        id: LOCATION_SYDNEY_ID,
        name: "Sydney CBD",
        region_code: "NSW",
        timezone: "Australia/Sydney",
      },
    ],
    name: "Acme Hotels Pty Ltd",
    people: [
      {
        email: "mia.roberts@acmehotels.example",
        employment_type: "employee",
        first_name: "Mia",
        id: PERSON_MIA_ID,
        job_title: "Housekeeping Manager",
        last_name: "Roberts",
        location_id: LOCATION_SYDNEY_ID,
        manager_person_id: null,
        person_type: "employee",
        source_person_key: "xero-emp-101",
        source_system: source_system.XERO,
        team_id: TEAM_HOUSEKEEPING_ID,
        xero_employee_id: "XERO-EMP-101",
      },
      {
        email: "noah.chen@acmehotels.example",
        employment_type: "offshore",
        first_name: "Noah",
        id: PERSON_NOAH_ID,
        job_title: "Reservations Specialist",
        last_name: "Chen",
        location_id: LOCATION_SYDNEY_ID,
        manager_person_id: PERSON_MIA_ID,
        person_type: "offshore_staff",
        source_person_key: "manual-101",
        source_system: source_system.MANUAL,
        team_id: TEAM_HOUSEKEEPING_ID,
        xero_employee_id: null,
      },
    ],
    region_code: "NSW",
    teams: [{ id: TEAM_HOUSEKEEPING_ID, name: "Housekeeping" }],
    timezone: "Australia/Sydney",
  },
];
