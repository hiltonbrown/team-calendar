import "server-only";

import { withinLimit } from "@repo/auth/server";
import {
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
} from "@repo/core";
import {
  assertTenantDb,
  lockPlanLimitMutations,
  resolveAccountCompanies,
  scopedQuery,
  type TenantDb,
} from "@repo/database";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
import { createCompany } from "../companies/create-company";
import {
  normaliseCurrentUserProfile,
  safeCurrentUserProfilePatch,
} from "./profile-normalisation";

const WHITESPACE_PATTERN = /\s+/;

export interface TenantContext {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
}

export interface OrganisationSettingsInput {
  clerkOrgId: string;
  countryCode: string;
  fiscalYearStart?: number;
  locale?: string;
  name: string;
  reportingUnit?: string;
  timezone?: string;
  workingHoursPerDay?: number;
}

export interface CurrentUserPersonInput {
  avatarUrl?: string | null;
  clerkUserId: string;
  displayName?: string | null;
  email?: string | null;
  firstName?: string | null;
  jobTitle?: string;
  lastName?: string | null;
}

export interface PersonView {
  email: string | null;
  id: string;
  initials: string;
  jobTitle: string | null;
  locationName: string | null;
  name: string;
  organisationId: string;
  teamName: string | null;
}

export const getInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(WHITESPACE_PATTERN)
    .filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

const mapPerson = (person: {
  organisation_id: string;
  email: string | null;
  id: string;
  job_title: string | null;
  display_name: string | null;
  first_name?: string;
  last_name?: string;
  location?: { name: string } | null;
  team?: { name: string } | null;
}): PersonView => {
  const fullName =
    person.display_name ??
    `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return {
    email: person.email,
    id: person.id,
    initials: getInitials(fullName),
    jobTitle: person.job_title,
    locationName: person.location?.name ?? null,
    name: fullName,
    organisationId: person.organisation_id,
    teamName: person.team?.name ?? null,
  };
};

export async function ensureOrganisationForClerk(
  input: OrganisationSettingsInput,
  db: TenantDb
): Promise<TenantContext> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    await lockPlanLimitMutations(input.clerkOrgId, client);

    const existingOrganisation = await client.organisation.findFirst({
      orderBy: { created_at: "asc" },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
      },
    });

    if (!existingOrganisation) {
      const entitlement = await withinLimit(
        input.clerkOrgId,
        "00000000-0000-4000-8000-000000000000",
        "payroll_entities",
        client
      );
      // Fail closed: if the entitlement check itself fails (DB outage, query
      // error) we must not silently allow a new payroll entity to be created.
      if (!entitlement.ok) {
        throw new Error("Unable to verify billing limits. Please try again.");
      }
      if (!entitlement.value.allowed) {
        throw new Error(
          "Your current plan has reached its payroll entity limit."
        );
      }
    }

    const organisation = existingOrganisation
      ? await client.organisation.update({
          data: {
            country_code: input.countryCode,
            fiscal_year_start: input.fiscalYearStart ?? 7,
            locale: input.locale ?? "en-AU",
            name: input.name,
            reporting_unit: input.reportingUnit ?? "hours",
            timezone: input.timezone ?? "UTC",
            working_hours_per_day: input.workingHoursPerDay ?? 7.6,
          },
          where: { id: existingOrganisation.id },
        })
      : await createCompany(input, client);

    const defaultFeed = await ensureDefaultCalendarFeed(
      {
        clerkOrgId: input.clerkOrgId,
        organisationId: organisation.id,
      },
      client
    );
    if (!defaultFeed.ok) {
      throw new Error(defaultFeed.error.message);
    }

    return {
      clerkOrgId: input.clerkOrgId as ClerkOrgId,
      organisationId: organisation.id as OrganisationId,
    };
  }
}

type PersonWithRelations = Parameters<typeof mapPerson>[0];

async function findResolvedMatchPerson(
  scoped: { clerk_org_id: string; organisation_id: string },
  clerkUserId: string,
  safeProfilePatch: Record<string, unknown>,
  db: TenantDb
): Promise<PersonWithRelations | null> {
  const resolvedMatch = await db.xeroPersonMatch.findFirst({
    include: {
      resolved_person: { include: { location: true, team: true } },
      xero_person: { include: { location: true, team: true } },
    },
    where: {
      ...scoped,
      resolved_clerk_user_id: clerkUserId,
      status: "matched",
    },
  });

  const targetPerson =
    resolvedMatch?.resolved_person ?? resolvedMatch?.xero_person;
  if (
    !targetPerson ||
    targetPerson.archived_at !== null ||
    targetPerson.clerk_org_id !== scoped.clerk_org_id ||
    targetPerson.organisation_id !== scoped.organisation_id
  ) {
    return null;
  }
  if (targetPerson.clerk_user_id !== clerkUserId) {
    await db.person.update({
      data: {
        ...safeProfilePatch,
        clerk_user_id: clerkUserId,
      },
      where: { id: targetPerson.id },
    });
  }
  return targetPerson;
}

export async function ensureCurrentUserPerson(
  tenant: TenantContext,
  input: CurrentUserPersonInput,
  db: TenantDb
): Promise<Result<PersonView>> {
  assertTenantDb(db, tenant.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof ensureCurrentUserPerson> => {
    await lockPlanLimitMutations(tenant.clerkOrgId, client);

    const scoped = scopedQuery(tenant.clerkOrgId, tenant.organisationId);
    const profile = normaliseCurrentUserProfile(input);
    const safeProfilePatch = safeCurrentUserProfilePatch(profile);
    const companies = await resolveAccountCompanies(tenant.clerkOrgId, client);
    const existingLinkedPerson = await client.person.findFirst({
      include: { location: true, team: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      where: {
        archived_at: null,
        clerk_org_id: tenant.clerkOrgId,
        clerk_user_id: input.clerkUserId,
        organisation_id: { in: companies.map((company) => company.id) },
      },
    });
    if (existingLinkedPerson) {
      return { ok: true, value: mapPerson(existingLinkedPerson) };
    }

    const matchPerson = await findResolvedMatchPerson(
      scoped,
      input.clerkUserId,
      safeProfilePatch,
      client
    );
    if (matchPerson) {
      return { ok: true, value: mapPerson(matchPerson) };
    }

    if (profile.email) {
      const sameEmailPeople = await client.person.findMany({
        include: { location: true, team: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        where: {
          archived_at: null,
          clerk_org_id: tenant.clerkOrgId,
          clerk_user_id: null,
          email: { equals: profile.email, mode: "insensitive" },
          organisation_id: { in: companies.map((company) => company.id) },
        },
      });

      if (sameEmailPeople.length > 1) {
        return {
          error: appError(
            "conflict",
            "Multiple people match this Clerk user's email. Review the people directory before opening plans."
          ),
          ok: false,
        };
      }

      const [sameEmailPerson] = sameEmailPeople;
      if (sameEmailPerson) {
        const person = await client.person.update({
          data: {
            ...safeProfilePatch,
            clerk_user_id: input.clerkUserId,
          },
          include: { location: true, team: true },
          where: { id: sameEmailPerson.id },
        });

        return { ok: true, value: mapPerson(person) };
      }
    }

    const entitlement = await withinLimit(
      tenant.clerkOrgId,
      tenant.organisationId,
      "seats",
      client
    );
    if (!entitlement.ok) {
      return { error: entitlement.error, ok: false };
    }
    if (!entitlement.value.allowed) {
      return {
        error: appError(
          "bad_request",
          "Your current plan has reached its active people limit."
        ),
        ok: false,
      };
    }

    await client.person.createMany({
      data: {
        avatar_url: profile.avatarUrl,
        clerk_org_id: tenant.clerkOrgId,
        clerk_user_id: input.clerkUserId,
        display_name: profile.displayName,
        email: profile.email ?? `${input.clerkUserId}@internal`,
        employment_type: "employee",
        first_name: profile.firstName,
        job_title: input.jobTitle ?? null,
        last_name: profile.lastName,
        organisation_id: tenant.organisationId,
        source_system: "MANUAL",
      },
      skipDuplicates: true,
    });

    const person = await client.person.findFirst({
      include: { location: true, team: true },
      where: {
        ...scoped,
        archived_at: null,
        clerk_user_id: input.clerkUserId,
      },
    });
    if (!person) {
      return {
        error: appError(
          "conflict",
          "The person could not be linked. Review the people directory."
        ),
        ok: false,
      };
    }
    return { ok: true, value: mapPerson(person) };
  };
  return await (async () => {
    assertTenantDb(db, tenant.clerkOrgId);
    return await run(db);
  })();
}

export async function listPersonViews(
  tenant: TenantContext,
  db: TenantDb
): Promise<PersonView[]> {
  assertTenantDb(db, tenant.clerkOrgId);
  {
    assertTenantDb(db, tenant.clerkOrgId);
    const client = db;

    const people = await client.person.findMany({
      include: { location: true, team: true },
      orderBy: [{ display_name: "asc" }, { first_name: "asc" }],
      where: {
        ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
        archived_at: null,
      },
    });

    return people.map(mapPerson);
  }
}
