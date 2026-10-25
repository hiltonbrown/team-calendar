import type { AccountId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";

export interface PersonData {
  accountId: string;
  createdAt: Date;
  email: string;
  employmentType: string;
  firstName: string;
  id: PersonId;
  isActive: boolean;
  lastName: string;
  locationId: string | null;
  organisationId: OrganisationId;
  sourcePersonKey: string | null;
  sourceSystem: string;
  teamId: string | null;
  updatedAt: Date;
}

interface PeopleFilters {
  isActive?: boolean;
  locationId?: string;
  teamId?: string;
}

export async function listPeopleForOrganisation(
  accountId: AccountId,
  organisationId: OrganisationId,
  filters: PeopleFilters | undefined,
  db: TenantDb
): Promise<Result<PersonData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const people = await tenantDb.person.findMany({
        orderBy: { first_name: "asc" },
        select: {
          account_id: true,
          created_at: true,
          email: true,
          employment_type: true,
          first_name: true,
          id: true,
          is_active: true,
          last_name: true,
          location_id: true,
          organisation_id: true,
          source_person_key: true,
          source_system: true,
          team_id: true,
          updated_at: true,
        },
        where: {
          ...scopedQuery(accountId, organisationId),
          ...(filters?.teamId && { team_id: filters.teamId }),
          ...(filters?.locationId && { location_id: filters.locationId }),
          ...(filters?.isActive !== undefined && {
            is_active: filters.isActive,
          }),
        },
      });

      return {
        ok: true,
        value: people.map(toPerson),
      };
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list people"),
        ok: false,
      };
    }
  }
}

export async function getPersonProfile(
  accountId: AccountId,
  organisationId: OrganisationId,
  personId: PersonId,
  db: TenantDb
): Promise<
  Result<
    PersonData & {
      team: { id: string; name: string } | null;
      location: { id: string; name: string } | null;
    }
  >
> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const person = await tenantDb2.person.findFirst({
        select: {
          account_id: true,
          created_at: true,
          email: true,
          employment_type: true,
          first_name: true,
          id: true,
          is_active: true,
          last_name: true,
          location: {
            select: {
              id: true,
              name: true,
            },
          },
          location_id: true,
          organisation_id: true,
          source_person_key: true,
          source_system: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          team_id: true,
          updated_at: true,
        },
        where: {
          ...scopedQuery(accountId, organisationId),
          id: personId,
        },
      });

      if (!person) {
        return {
          error: appError("not_found", "Person not found"),
          ok: false,
        };
      }

      return {
        ok: true,
        value: {
          ...toPerson(person),
          location: person.location,
          team: person.team,
        },
      };
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to get person profile"),
        ok: false,
      };
    }
  }
}

function toPerson(p: {
  id: string;
  account_id: string;
  organisation_id: string;
  team_id: string | null;
  location_id: string | null;
  source_system: string;
  source_person_key: string | null;
  first_name: string;
  last_name: string;
  email: string;
  employment_type: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): PersonData {
  return {
    accountId: p.account_id,
    createdAt: p.created_at,
    email: p.email,
    employmentType: p.employment_type,
    firstName: p.first_name,
    id: p.id as PersonId,
    isActive: p.is_active,
    lastName: p.last_name,
    locationId: p.location_id,
    organisationId: p.organisation_id as OrganisationId,
    sourcePersonKey: p.source_person_key,
    sourceSystem: p.source_system,
    teamId: p.team_id,
    updatedAt: p.updated_at,
  };
}
