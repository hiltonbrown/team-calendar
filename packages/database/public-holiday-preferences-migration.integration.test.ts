// biome-ignore-all lint/style/useFilenamingConvention: Database test files follow existing naming.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { isLocalDatabase } from "./src/is-local-database";
import { assertTestDatabaseConnectionAllowed } from "./src/live-test-guard";

// Runs the bundled-holiday data migration against a throwaway database so the
// pre-migration shape (jurisdictions, assignments, Nager rows) can be seeded.
const DATA_MIGRATION = "20261009025909_replace_imported_public_holidays";
const MIGRATION_DIRECTORY = /^\d{14}_/;
const migrationsDir = join(import.meta.dirname, "prisma", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => MIGRATION_DIRECTORY.test(name))
  .sort();
const migrationsBeforeData = migrations.filter((name) => name < DATA_MIGRATION);

assertTestDatabaseConnectionAllowed();
const baseUrl = process.env.DATABASE_URL ?? "";
if (!isLocalDatabase(baseUrl)) {
  throw new Error("This migration test only runs against a local database");
}
const scratchName = `tc_holiday_migration_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;
const admin = new Client({ connectionString: baseUrl });
const scratch = new Client({ connectionString: scratchUrl.toString() });

const ids = {
  customAll: randomUUID(),
  customScoped: randomUUID(),
  customSuppressed: randomUUID(),
  jurisdictionA: randomUUID(),
  jurisdictionB: randomUUID(),
  locationA: randomUUID(),
  locationB: randomUUID(),
  nagerA: randomUUID(),
  nagerB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
};

async function seed() {
  await scratch.query(
    `INSERT INTO organisations (id, clerk_org_id, name, country_code, region_code, updated_at)
     VALUES ($1, 'org_a', 'A', 'AU', 'Queensland', now()), ($2, 'org_b', 'B', 'UK', 'scotland', now())`,
    [ids.orgA, ids.orgB]
  );
  await scratch.query(
    `INSERT INTO locations (id, clerk_org_id, organisation_id, name, country_code, region_code, updated_at)
     VALUES ($1, 'org_a', $2, 'Sydney', 'AU', 'New South Wales', now()),
            ($3, 'org_b', $4, 'Atlantis', NULL, 'Atlantis', now())`,
    [ids.locationA, ids.orgA, ids.locationB, ids.orgB]
  );
  await scratch.query(
    `INSERT INTO public_holiday_jurisdictions (id, clerk_org_id, organisation_id, country_code, region_code, source, updated_at)
     VALUES ($1, 'org_a', $2, 'AU', 'NSW', 'nager', now()), ($3, 'org_b', $4, 'UK', NULL, 'nager', now())`,
    [ids.jurisdictionA, ids.orgA, ids.jurisdictionB, ids.orgB]
  );
  const holiday = `INSERT INTO public_holidays
      (id, clerk_org_id, organisation_id, jurisdiction_id, source, source_remote_id, country_code,
       region_code, holiday_date, name, holiday_type, archived_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, '2026-12-25', $8, $9, $10, now())`;
  await scratch.query(holiday, [
    ids.nagerA,
    "org_a",
    ids.orgA,
    ids.jurisdictionA,
    "nager",
    "n-a",
    "AU",
    "Christmas Day",
    "public",
    null,
  ]);
  await scratch.query(holiday, [
    ids.nagerB,
    "org_b",
    ids.orgB,
    ids.jurisdictionB,
    "nager",
    "n-b",
    "UK",
    "Christmas Day",
    "public",
    null,
  ]);
  await scratch.query(holiday, [
    ids.customScoped,
    "org_a",
    ids.orgA,
    ids.jurisdictionA,
    "manual",
    "c-1",
    "CUSTOM",
    "Office day",
    "custom",
    null,
  ]);
  await scratch.query(holiday, [
    ids.customAll,
    "org_a",
    ids.orgA,
    null,
    "manual",
    "c-2",
    "CUSTOM",
    "Founders day",
    "custom",
    null,
  ]);
  await scratch.query(holiday, [
    ids.customSuppressed,
    "org_b",
    ids.orgB,
    null,
    "manual",
    "c-3",
    "CUSTOM",
    "Old day",
    "custom",
    new Date(),
  ]);
  const assignment = `INSERT INTO public_holiday_assignments
      (id, clerk_org_id, organisation_id, public_holiday_id, scope_type, scope_value, day_classification, updated_at)
     VALUES ($1, $2, $3, $4, 'location', $5, $6, now())`;
  await scratch.query(assignment, [
    randomUUID(),
    "org_a",
    ids.orgA,
    ids.customScoped,
    ids.locationA,
    "working",
  ]);
  await scratch.query(assignment, [
    randomUUID(),
    "org_a",
    ids.orgA,
    ids.nagerA,
    ids.locationA,
    "working",
  ]);
  // A location from another organisation must not become a preference.
  await scratch.query(assignment, [
    randomUUID(),
    "org_a",
    ids.orgA,
    ids.customAll,
    ids.locationB,
    "non_working",
  ]);
}

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${scratchName}"`);
  await scratch.connect();
  for (const name of migrationsBeforeData) {
    await scratch.query(
      readFileSync(join(migrationsDir, name, "migration.sql"), "utf8")
    );
  }
  await seed();
  await scratch.query(
    readFileSync(join(migrationsDir, DATA_MIGRATION, "migration.sql"), "utf8")
  );
}, 120_000);

afterAll(async () => {
  await scratch.end();
  await admin.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
  await admin.end();
});

describe("replace imported public holidays migration", () => {
  test("removes imported holidays, their assignments and every jurisdiction", async () => {
    const holidays = await scratch.query(
      "SELECT id FROM public_holidays WHERE source = 'nager'"
    );
    const assignments = await scratch.query(
      "SELECT id FROM public_holiday_assignments WHERE public_holiday_id = ANY($1::uuid[])",
      [[ids.nagerA, ids.nagerB]]
    );
    const jurisdictions = await scratch.query(
      "SELECT id FROM public_holiday_jurisdictions"
    );
    expect(holidays.rows).toEqual([]);
    expect(assignments.rows).toEqual([]);
    expect(jurisdictions.rows).toEqual([]);
  });

  test("keeps custom holidays and moves jurisdiction scope onto them", async () => {
    const { rows } = await scratch.query(
      "SELECT id, country_code, region_code, jurisdiction_id, archived_at FROM public_holidays ORDER BY name"
    );
    expect(rows).toEqual([
      {
        archived_at: null,
        country_code: "CUSTOM",
        id: ids.customAll,
        jurisdiction_id: null,
        region_code: null,
      },
      {
        archived_at: null,
        country_code: "AU",
        id: ids.customScoped,
        jurisdiction_id: null,
        region_code: "NSW",
      },
      {
        archived_at: null,
        country_code: "CUSTOM",
        id: ids.customSuppressed,
        jurisdiction_id: null,
        region_code: null,
      },
    ]);
  });

  test("turns custom location overrides and suppression into scoped preferences", async () => {
    const { rows } = await scratch.query(
      "SELECT clerk_org_id, organisation_id, holiday_key, location_id, setting FROM public_holiday_preferences ORDER BY holiday_key"
    );
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          clerk_org_id: "org_a",
          holiday_key: `custom:${ids.customScoped}`,
          location_id: ids.locationA,
          organisation_id: ids.orgA,
          setting: "working",
        },
        {
          clerk_org_id: "org_b",
          holiday_key: `custom:${ids.customSuppressed}`,
          location_id: null,
          organisation_id: ids.orgB,
          setting: "hidden",
        },
      ])
    );
  });

  test("normalises region names to registry codes and clears unknown values", async () => {
    const organisations = await scratch.query(
      "SELECT id, region_code FROM organisations ORDER BY name"
    );
    const locations = await scratch.query(
      "SELECT id, region_code FROM locations ORDER BY name"
    );
    expect(organisations.rows).toEqual([
      { id: ids.orgA, region_code: "QLD" },
      { id: ids.orgB, region_code: "SCT" },
    ]);
    expect(locations.rows).toEqual([
      { id: ids.locationB, region_code: null },
      { id: ids.locationA, region_code: "NSW" },
    ]);
  });
});
