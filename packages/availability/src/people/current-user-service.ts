import "server-only";

import { withinLimit } from "@repo/auth/server";
import {
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
import { ensureDefaultPublicHolidaysForOrganisation } from "../holidays/holiday-service";
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
    teamName: person.team?.name ?? null,
  };
};

export const ensureOrganisationForClerk = async (
  input: OrganisationSettingsInput
): Promise<TenantContext> => {
  const existingOrganisation = await database.organisation.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
    orderBy: { created_at: "asc" },
  });

  if (!existingOrganisation) {
    const entitlement = await withinLimit(
      input.clerkOrgId,
      "00000000-0000-4000-8000-000000000000",
      "payroll_entities"
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
    ? await database.organisation.update({
        where: { id: existingOrganisation.id },
        data: {
          country_code: input.countryCode,
          fiscal_year_start: input.fiscalYearStart ?? 7,
          locale: input.locale ?? "en-AU",
          name: input.name,
          reporting_unit: input.reportingUnit ?? "hours",
          timezone: input.timezone ?? "UTC",
          working_hours_per_day: input.workingHoursPerDay ?? 7.6,
        },
      })
    : await database.organisation.create({
        data: {
          clerk_org_id: input.clerkOrgId,
          country_code: input.countryCode,
          fiscal_year_start: input.fiscalYearStart ?? 7,
          locale: input.locale ?? "en-AU",
          name: input.name,
          reporting_unit: input.reportingUnit ?? "hours",
          timezone: input.timezone ?? "UTC",
          working_hours_per_day: input.workingHoursPerDay ?? 7.6,
        },
      });

  const defaultFeed = await ensureDefaultCalendarFeed({
    clerkOrgId: input.clerkOrgId,
    organisationId: organisation.id,
  });
  if (!defaultFeed.ok) {
    throw new Error(defaultFeed.error.message);
  }

  const holidayProvisioningResult =
    await ensureDefaultPublicHolidaysForOrganisation({
      clerkOrgId: input.clerkOrgId as ClerkOrgId,
      organisationId: organisation.id as OrganisationId,
    });
  if (!holidayProvisioningResult.ok) {
    // Non-fatal: organisation provisioning should continue even if Nager is unavailable.
  }

  return {
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    organisationId: organisation.id as OrganisationId,
  };
};

export const ensureCurrentUserPerson = async (
  tenant: TenantContext,
  input: CurrentUserPersonInput
): Promise<Result<PersonView>> => {
  const scoped = scopedQuery(tenant.clerkOrgId, tenant.organisationId);
  const profile = normaliseCurrentUserProfile(input);
  const safeProfilePatch = safeCurrentUserProfilePatch(profile);

  try {
    const existingLinkedPerson = await database.person.findFirst({
      where: {
        ...scoped,
        archived_at: null,
        clerk_user_id: input.clerkUserId,
      },
      include: { location: true, team: true },
    });

    if (existingLinkedPerson) {
      return { ok: true, value: mapPerson(existingLinkedPerson) };
    }

    if (profile.email) {
      const sameEmailPeople = await database.person.findMany({
        where: {
          ...scoped,
          archived_at: null,
          clerk_user_id: null,
          email: { equals: profile.email, mode: "insensitive" },
        },
        include: { location: true, team: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      });

      if (sameEmailPeople.length > 1) {
        return {
          ok: false,
          error: appError(
            "conflict",
            "Multiple people match this Clerk user's email. Review the people directory before opening plans."
          ),
        };
      }

      const sameEmailPerson = sameEmailPeople[0];
      if (sameEmailPerson) {
        const person = await database.person.update({
          where: { id: sameEmailPerson.id },
          data: {
            ...safeProfilePatch,
            clerk_user_id: input.clerkUserId,
          },
          include: { location: true, team: true },
        });

        return { ok: true, value: mapPerson(person) };
      }
    }

    const entitlement = await withinLimit(
      tenant.clerkOrgId,
      tenant.organisationId,
      "seats"
    );
    if (!entitlement.ok) {
      return { ok: false, error: entitlement.error };
    }
    if (!entitlement.value.allowed) {
      return {
        ok: false,
        error: appError(
          "bad_request",
          "Your current plan has reached its active people limit."
        ),
      };
    }

    const person = await database.person.create({
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
      include: { location: true, team: true },
    });

    return { ok: true, value: mapPerson(person) };
  } catch {
    return {
      ok: false,
      error: appError(
        "internal",
        "Failed to ensure the current user has a person profile."
      ),
    };
  }
};

export const listPersonViews = async (
  tenant: TenantContext
): Promise<PersonView[]> => {
  const people = await database.person.findMany({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
    },
    include: { location: true, team: true },
    orderBy: [{ display_name: "asc" }, { first_name: "asc" }],
  });

  return people.map(mapPerson);
};
