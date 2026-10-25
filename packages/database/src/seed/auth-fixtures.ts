import { createHash } from "node:crypto";
import {
  type DevelopmentSeedAccount,
  seedDevelopmentAuthAccounts,
} from "../../../auth/development-seed";
import type { PrismaClient } from "../../generated/client";
import { referenceDatabase } from "../tenant-client";
import { withTenantDb } from "../tenant-db";
import { assertNoTenantTransaction } from "../tenant-guard";
import { syncPlansFromCatalogue } from "./plan-sync";

function fixtureId(country: string, resource: string): string {
  const hex = createHash("sha256")
    .update(`team-calendar-development-v1:${country}:${resource}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = (8 + (Number.parseInt(hex[16], 16) % 4)).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function seedAccountDomain(
  account: DevelopmentSeedAccount
): Promise<void> {
  const organisationId = fixtureId(account.country, "company");
  const teamId = fixtureId(account.country, "team");
  const locationId = fixtureId(account.country, "location");
  await withTenantDb(account.accountId, async (db) => {
    const company = {
      account_id: account.accountId,
      country_code: account.country,
      is_active: true,
      name: `${account.country} test payroll company`,
      timezone: account.timeZone,
    };
    await db.organisation.upsert({
      create: { id: organisationId, ...company },
      update: company,
      where: { account_id: account.accountId, id: organisationId },
    });
    const scope = {
      account_id: account.accountId,
      organisation_id: organisationId,
    };
    await db.team.upsert({
      create: { id: teamId, ...scope, name: "Test team" },
      update: { name: "Test team" },
      where: { id: teamId, ...scope },
    });
    await db.location.upsert({
      create: {
        id: locationId,
        ...scope,
        country_code: account.country,
        name: `${account.country} test office`,
        timezone: account.timeZone,
      },
      update: { country_code: account.country, timezone: account.timeZone },
      where: { id: locationId, ...scope },
    });
    // The manager precedes the viewer's FK. Auth roles are independent of the
    // company team and reporting relationships used by domain authorisation.
    const ordered = [...account.users].sort(
      (left, right) =>
        Number(left.role === "viewer") - Number(right.role === "viewer")
    );
    for (const user of ordered) {
      const personId = fixtureId(account.country, `person:${user.role}`);
      const person = {
        ...scope,
        display_name: `${account.country} ${user.role}`,
        email: user.email,
        employment_type: "employee" as const,
        first_name: account.country,
        is_active: true,
        last_name: user.role,
        location_id: locationId,
        manager_person_id:
          user.role === "viewer"
            ? fixtureId(account.country, "person:manager")
            : null,
        person_type: "employee" as const,
        source_person_key: `development:${user.role}`,
        source_system: "MANUAL" as const,
        team_id: teamId,
        user_id: user.userId,
      };
      await db.person.upsert({
        create: { id: personId, ...person },
        update: person,
        where: { id: personId, ...scope },
      });
    }
    await db.accountSettings.upsert({
      create: { account_id: account.accountId },
      update: {},
      where: { account_id: account.accountId },
    });
  });
}

/** Standalone fixture flow; auth commits before restricted tenant provisioning. */
export async function seedAuthDevelopmentFixtures(
  owner: PrismaClient,
  password: string
) {
  assertNoTenantTransaction("seedAuthDevelopmentFixtures");
  const accounts = await seedDevelopmentAuthAccounts(owner, { password });
  const plans = await syncPlansFromCatalogue(owner);
  for (const account of accounts) {
    await seedAccountDomain(account);
    await owner.authOrganization.update({
      data: { provisioning_status: "ready" },
      where: { country_code: account.country, id: account.accountId },
    });
  }
  return {
    accounts,
    organisations: accounts.length,
    people: accounts.reduce((sum, account) => sum + account.users.length, 0),
    plans,
    teams: accounts.length,
  };
}

export async function closeDevelopmentSeedTenantClient(): Promise<void> {
  await referenceDatabase.$disconnect();
}
