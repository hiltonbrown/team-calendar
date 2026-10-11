import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { assertRestrictedDatabaseRole } from "./src/runtime-role";
import { systemDatabase } from "./src/system-client";
import {
  referenceDatabase,
  tenantDatabase,
  tenantTransaction,
} from "./src/tenant-client";

const accountA = `rls-a-${randomUUID()}`;
const accountB = `rls-b-${randomUUID()}`;
let companyA: string;
let companyB: string;
const appUrl = process.env.DATABASE_APP_URL;
if (!appUrl) {
  throw new Error("RLS integration tests require DATABASE_APP_URL");
}
const unscoped = referenceDatabase;

beforeAll(async () => {
  const [first, second] = await Promise.all(
    [accountA, accountB].map((clerk_org_id) =>
      systemDatabase.organisation.create({
        data: { clerk_org_id, country_code: "AU", name: clerk_org_id },
      })
    )
  );
  companyA = first.id;
  companyB = second.id;
});
afterAll(async () => {
  await systemDatabase.organisation.deleteMany({
    where: { clerk_org_id: { in: [accountA, accountB] } },
  });
  await unscoped.$disconnect();
});

test("restricted role has no elevated memberships or table ownership", async () => {
  await expect(assertRestrictedDatabaseRole(appUrl)).resolves.toBeUndefined();
  await expect(
    assertRestrictedDatabaseRole(process.env.DATABASE_URL ?? "")
  ).rejects.toThrow("non-owner");
});

test("tenant reads omit another account even without application filters", async () => {
  const rows = await tenantDatabase(accountA).organisation.findMany();
  expect(rows.map((row) => row.id)).toEqual([companyA]);
  expect(
    await tenantDatabase(accountA).organisation.findFirst({
      where: { id: companyB },
    })
  ).toBeNull();
});

test("crafted cross-account updates and deletes affect zero rows", async () => {
  const db = tenantDatabase(accountA);
  expect(
    await db.organisation.updateMany({
      data: { name: "changed" },
      where: { id: companyB },
    })
  ).toEqual({ count: 0 });
  expect(await db.organisation.deleteMany({ where: { id: companyB } })).toEqual(
    { count: 0 }
  );
});

test("WITH CHECK rejects another account and mismatched company pairing", async () => {
  const db = tenantDatabase(accountA);
  await expect(
    db.organisation.create({
      data: { clerk_org_id: accountB, country_code: "AU", name: "forged" },
    })
  ).rejects.toThrow();
  await expect(
    db.organisationSettings.create({
      data: { clerk_org_id: accountA, organisation_id: companyB },
    })
  ).rejects.toThrow();
});

test("missing context fails closed and scoped context does not survive pooling", async () => {
  expect(await unscoped.organisation.findMany()).toEqual([]);
  await tenantDatabase(accountA).organisation.findMany();
  expect(await unscoped.organisation.findMany()).toEqual([]);
  const [context] = await unscoped.$queryRaw<
    Array<{ tenant: string | null }>
  >`SELECT nullif(current_setting('app.clerk_org_id', true), '') AS tenant`;
  expect(context.tenant).toBeNull();
});

test("raw SQL in a tenant transaction uses the same account boundary", async () => {
  const ids = await tenantTransaction(accountA, async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM organisations`;
    return rows.map((row) => row.id);
  });
  expect(ids).toEqual([companyA]);
});

test("every table is classified and tenant tables have enabled policies", async () => {
  const rows = await systemDatabase.$queryRaw<
    Array<{
      name: string;
      tenant: boolean;
      enabled: boolean;
      policy: boolean;
      granted: boolean;
      writable: boolean;
      any_privilege: boolean;
    }>
  >`
    SELECT c.relname AS name,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'clerk_org_id' AND NOT a.attisdropped) AS tenant,
      c.relrowsecurity AS enabled,
      EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS policy,
      has_table_privilege('team_calendar_app', c.oid, 'SELECT') AS granted,
      has_table_privilege('team_calendar_app', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE') AS writable,
      has_table_privilege('team_calendar_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS any_privilege
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  `;
  const references = ["plans", "plan_limits"];
  const forbidden = [
    "xero_authorisations",
    "stripe_events",
    "_prisma_migrations",
  ];
  for (const row of rows) {
    if (forbidden.includes(row.name)) {
      expect(row.any_privilege, row.name).toBe(false);
    } else if (references.includes(row.name)) {
      expect(row.granted, row.name).toBe(true);
      expect(row.writable, row.name).toBe(false);
    } else {
      expect(row.tenant, `${row.name} is unclassified`).toBe(true);
      expect(row.enabled, row.name).toBe(true);
      expect(row.policy, row.name).toBe(true);
      expect(row.granted, row.name).toBe(true);
    }
  }
  await expect(unscoped.xeroAuthorisation.findMany()).rejects.toThrow();
  await expect(unscoped.stripeEvent.findMany()).rejects.toThrow();
});

test("standalone tenant raw SQL receives transaction-local context", async () => {
  const rows = await tenantDatabase(accountA).$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM organisations`;
  expect(rows.map((row) => row.id)).toEqual([companyA]);
  expect(await unscoped.organisation.findMany()).toEqual([]);
});
