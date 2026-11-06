import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { assertRestrictedDatabaseRole } from "./src/runtime-role";
import { systemDatabase } from "./src/system-client";
import { referenceDatabase } from "./src/tenant-client";
import {
  assertTenantDb,
  TenantMismatchError,
  withTenantDb,
} from "./src/tenant-db";

vi.mock("./src/tenant-client", async () => {
  const { assertTestDatabaseConnectionAllowed } = await import(
    "./src/live-test-guard"
  );
  const { isLocalDatabase } = await import("./src/is-local-database");
  const { PrismaClient } = await import("./generated/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const { neonConfig } = await import("@neondatabase/serverless");
  const { default: WebSocket } = await import("ws");
  const configured = process.env.DATABASE_APP_URL;
  if (!configured) {
    throw new Error("RLS tests require the restricted connection");
  }
  assertTestDatabaseConnectionAllowed(configured);
  const direct = new URL(configured);
  if (direct.hostname.endsWith(".neon.tech")) {
    direct.hostname = direct.hostname.replace("-pooler.", ".");
  }
  // A dedicated direct pool pins one real backend for the commit/rollback PID
  // checks. PgBouncer may legitimately choose another backend between requests.
  neonConfig.webSocketConstructor = WebSocket;
  const config = { connectionString: direct.toString(), max: 1 };
  return {
    referenceDatabase: new PrismaClient({
      adapter: isLocalDatabase(configured)
        ? new PrismaPg(config)
        : new PrismaNeon(config),
    }),
  };
});

const tenantFixture = allocateLiveTestFixture(
  "packages/database/row-level-security.integration.test.ts"
);
const [tenantA, tenantB] = tenantFixture.tenants;
if (!(tenantA && tenantB)) {
  throw new Error("RLS integration tests require two owned account fixtures");
}
const accountA = tenantA.accountId;
const accountB = tenantB.accountId;
const companyA = tenantA.organisationId;
const companyB = tenantB.organisationId;
const appUrl = process.env.DATABASE_APP_URL;
if (!appUrl) {
  throw new Error("RLS integration tests require DATABASE_APP_URL");
}
const unscoped = referenceDatabase;

beforeAll(async () => {
  await Promise.all(
    [tenantA, tenantB].map(({ accountId, organisationId }) =>
      systemDatabase.organisation.create({
        data: {
          account_id: accountId,
          country_code: "AU",
          id: organisationId,
          name: accountId,
        },
      })
    )
  );
});
afterAll(async () => {
  await systemDatabase.accountSettings.deleteMany({
    where: { account_id: { in: [accountA, accountB] } },
  });
  await systemDatabase.organisation.deleteMany({
    where: { account_id: { in: [accountA, accountB] } },
  });
  await unscoped.$disconnect();
});

test("restricted role has no elevated memberships or table ownership", async () => {
  await expect(assertRestrictedDatabaseRole(appUrl)).resolves.toBeUndefined();
  await expect(
    assertRestrictedDatabaseRole(process.env.DATABASE_URL ?? "")
  ).rejects.toThrow("non-owner");
});

test("preflight rejects inherited table ownership that bypasses RLS", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ownerRole = `rls_owner_${suffix}`;
  const tableName = `rls_role_${suffix}`;
  const appRole = new URL(appUrl).username.replaceAll('"', '""');
  const ownerRoleName = new URL(
    process.env.DATABASE_URL ?? ""
  ).username.replaceAll('"', '""');
  // Identifiers use generated hexadecimal names or a quoted URL role name.
  // Only this disposable table belongs to the temporary inherited role.
  try {
    await systemDatabase.$executeRawUnsafe(
      `CREATE ROLE "${ownerRole}" NOLOGIN`
    );
    await systemDatabase.$executeRawUnsafe(
      `GRANT "${ownerRole}" TO "${ownerRoleName}" WITH SET TRUE`
    );
    await systemDatabase.$executeRawUnsafe(
      `GRANT USAGE, CREATE ON SCHEMA public TO "${ownerRole}"`
    );
    await systemDatabase.$executeRawUnsafe(
      `CREATE TABLE "${tableName}" (account_id text NOT NULL)`
    );
    await systemDatabase.$executeRawUnsafe(
      `INSERT INTO "${tableName}" VALUES ('other-account')`
    );
    await systemDatabase.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`
    );
    await systemDatabase.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" OWNER TO "${ownerRole}"`
    );
    await systemDatabase.$executeRawUnsafe(
      `GRANT "${ownerRole}" TO "${appRole}"`
    );
    expect(
      await unscoped.$queryRawUnsafe(`SELECT * FROM "${tableName}"`)
    ).toEqual([{ account_id: "other-account" }]);
    await expect(assertRestrictedDatabaseRole(appUrl)).rejects.toThrow(
      "non-owner"
    );
  } finally {
    await systemDatabase.$executeRawUnsafe(
      `REVOKE "${ownerRole}" FROM "${appRole}"`
    );
    await systemDatabase.$executeRawUnsafe(
      `DROP TABLE IF EXISTS "${tableName}"`
    );
    await systemDatabase.$executeRawUnsafe(
      `REVOKE USAGE, CREATE ON SCHEMA public FROM "${ownerRole}"`
    );
    await systemDatabase.$executeRawUnsafe(
      `DROP ROLE IF EXISTS "${ownerRole}"`
    );
  }
});

test("legacy context alone fails closed while account context permits its rows", async () => {
  await unscoped.$transaction(async (db) => {
    await db.$queryRaw`SELECT set_config('app.account_id', '', true)`;
    // The legacy setting must no longer authorise tenant access after the rename.
    await db.$queryRaw`SELECT set_config('app.clerk_org_id', ${accountA}, true)`;
    expect(await db.organisation.findMany()).toEqual([]);
    await db.$queryRaw`SELECT set_config('app.account_id', ${accountA}, true)`;
    expect((await db.organisation.findMany()).map((row) => row.id)).toEqual([
      companyA,
    ]);
  });
});

test("tenant reads omit another account even without application filters", async () => {
  const rows = await withTenantDb(accountA, (db) => db.organisation.findMany());
  expect(rows.map((row) => row.id)).toEqual([companyA]);
  expect(
    await withTenantDb(accountA, (db) =>
      db.organisation.findFirst({
        where: { id: companyB },
      })
    )
  ).toBeNull();
});

test("crafted cross-account updates and deletes affect zero rows", async () => {
  await withTenantDb(accountA, async (db) => {
    expect(
      await db.organisation.updateMany({
        data: { name: "changed" },
        where: { id: companyB },
      })
    ).toEqual({ count: 0 });
    expect(
      await db.organisation.deleteMany({ where: { id: companyB } })
    ).toEqual({ count: 0 });
  });
});

test("WITH CHECK rejects another account and mismatched company pairing", async () => {
  await expect(
    withTenantDb(accountA, (db) =>
      db.organisation.create({
        data: { account_id: accountB, country_code: "AU", name: "forged" },
      })
    )
  ).rejects.toThrow();
  await expect(
    withTenantDb(accountA, (db) =>
      db.organisationSettings.create({
        data: { account_id: accountA, organisation_id: companyB },
      })
    )
  ).rejects.toThrow();
});

test("missing context fails closed and scoped context does not survive pooling", async () => {
  expect(await unscoped.organisation.findMany()).toEqual([]);
  await withTenantDb(accountA, (db) => db.organisation.findMany());
  expect(await unscoped.organisation.findMany()).toEqual([]);
  const [context] = await unscoped.$queryRaw<
    Array<{ tenant: string | null }>
  >`SELECT nullif(current_setting('app.account_id', true), '') AS tenant`;
  expect(context.tenant).toBeNull();
});

test("raw SQL in a tenant transaction uses the same account boundary", async () => {
  const ids = await withTenantDb(accountA, async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM organisations`;
    return rows.map((row) => row.id);
  });
  expect(ids).toEqual([companyA]);
});

test("twenty interleaved request transactions isolate both accounts", async () => {
  const requests = Array.from({ length: 20 }, (_, index) => ({
    account: index % 2 === 0 ? accountA : accountB,
    company: index % 2 === 0 ? companyA : companyB,
  }));
  const results = await Promise.all(
    requests.map(({ account }) =>
      withTenantDb(account, (db) => db.organisation.findMany())
    )
  );
  for (const [index, rows] of results.entries()) {
    expect(rows.map(({ id }) => id)).toEqual([requests[index]?.company]);
  }
});

test.each(["commit", "rollback"])(
  "request context is cleared on the same pooled connection after %s",
  async (outcome) => {
    let transactionPid: number | undefined;
    const failure = new Error("injected rollback");
    const request = withTenantDb(accountA, async (db) => {
      const [row] = await db.$queryRaw<Array<{ pid: number; tenant: string }>>`
      SELECT pg_backend_pid() AS pid, current_setting('app.account_id', true) AS tenant
    `;
      transactionPid = row.pid;
      expect(row.tenant).toBe(accountA);
      if (outcome === "rollback") {
        throw failure;
      }
    });
    if (outcome === "rollback") {
      await expect(request).rejects.toBe(failure);
    } else {
      await request;
    }
    const [row] = await unscoped.$queryRaw<
      Array<{ pid: number; tenant: string | null }>
    >`
    SELECT pg_backend_pid() AS pid, current_setting('app.account_id', true) AS tenant
  `;
    // Matching the PID prevents a fresh connection from masking a context leak.
    expect(row.pid).toBe(transactionPid);
    expect(row.tenant ?? "").toBe("");
    expect(await unscoped.organisation.findMany()).toEqual([]);
  }
);

test("request client rejects another account before its data query", async () => {
  await withTenantDb(accountA, (db) => {
    expect(() => assertTenantDb(db, accountB)).toThrow(TenantMismatchError);
    return Promise.resolve();
  });
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
    SELECT c.relname::text AS name,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'account_id' AND NOT a.attisdropped) AS tenant,
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
    "account_invitations",
    "account_members",
    "accounts",
    "auth_audit_events",
    "auth_identities",
    "auth_rate_limits",
    "auth_sessions",
    "auth_users",
    "auth_verifications",
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
  await expect(unscoped.authUser.findMany()).rejects.toThrow();
  await expect(unscoped.authSession.findMany()).rejects.toThrow();
  await expect(unscoped.authIdentity.findMany()).rejects.toThrow();
  await expect(unscoped.authVerification.findMany()).rejects.toThrow();
  await expect(unscoped.authOrganization.findMany()).rejects.toThrow();
  await expect(unscoped.authMember.findMany()).rejects.toThrow();
  await expect(unscoped.authInvitation.findMany()).rejects.toThrow();
  await expect(unscoped.authRateLimit.findMany()).rejects.toThrow();
  await expect(unscoped.authAuditEvent.findMany()).rejects.toThrow();
});

test("standalone tenant raw SQL receives transaction-local context", async () => {
  const rows = await withTenantDb(
    accountA,
    (db) => db.$queryRaw<Array<{ id: string }>>`SELECT id FROM organisations`
  );
  expect(rows.map((row) => row.id)).toEqual([companyA]);
  expect(await unscoped.organisation.findMany()).toEqual([]);
});

test("account settings isolate accounts without requiring a selected company", async () => {
  await systemDatabase.accountSettings.createMany({
    data: [{ account_id: accountA }, { account_id: accountB }],
    skipDuplicates: true,
  });
  await withTenantDb(accountA, async (db) => {
    expect(
      await db.accountSettings.findMany({ where: { account_id: accountB } })
    ).toEqual([]);
    expect(
      await db.accountSettings.updateMany({
        data: { manager_visibility_scope: "all_team_leave" },
        where: { account_id: accountB },
      })
    ).toEqual({ count: 0 });
    const own = await db.accountSettings.findFirst({
      where: { account_id: accountA },
    });
    expect(own?.account_id).toBe(accountA);
  });
  await expect(
    withTenantDb(accountA, (db) =>
      db.accountSettings.create({
        data: { account_id: `${accountB}-forged` },
      })
    )
  ).rejects.toThrow();
});

test("account settings migration backfills the most restrictive company policy", async () => {
  const script = await readFile(
    new URL(
      "./prisma/migrations/20261014000000_account_manager_visibility/migration.sql",
      import.meta.url
    ),
    "utf8"
  );
  const insert = script.match(ACCOUNT_SETTINGS_INSERT_PATTERN)?.[0];
  if (!insert) {
    throw new Error("Account settings backfill is missing");
  }
  const mixed = `rls-mixed-${randomUUID()}`;
  const permissive = `rls-all-${randomUUID()}`;
  await systemDatabase.$transaction(async (db) => {
    // Exercise the historical INSERT with temporary pre-contraction tables.
    await db.$executeRaw`CREATE TEMP TABLE manager_visibility_source (clerk_org_id TEXT NOT NULL, manager_visibility_scope TEXT NOT NULL) ON COMMIT DROP`;
    await db.$executeRaw`CREATE TEMP TABLE manager_visibility_result (id UUID NOT NULL, clerk_org_id TEXT UNIQUE NOT NULL, manager_visibility_scope TEXT NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL) ON COMMIT DROP`;
    for (const [account, scopes] of [
      [mixed, ["all_team_leave", "direct_reports_only"]],
      [permissive, ["all_team_leave", "all_team_leave"]],
    ] as const) {
      for (const scope of scopes) {
        await db.$executeRaw`INSERT INTO manager_visibility_source (clerk_org_id, manager_visibility_scope) VALUES (${account}, ${scope})`;
      }
    }
    const temporaryInsert = insert
      .replaceAll('"account_settings"', '"manager_visibility_result"')
      .replaceAll('"organisation_settings"', '"manager_visibility_source"');
    await db.$executeRawUnsafe(temporaryInsert);
    const rows = await db.$queryRaw<
      Array<{ clerk_org_id: string; manager_visibility_scope: string }>
    >`SELECT clerk_org_id, manager_visibility_scope FROM manager_visibility_result`;
    expect(
      rows.find((row) => row.clerk_org_id === mixed)?.manager_visibility_scope
    ).toBe("direct_reports_only");
    expect(
      rows.find((row) => row.clerk_org_id === permissive)
        ?.manager_visibility_scope
    ).toBe("all_team_leave");
  });
});

test("manager RLS permits another owned company and rejects a foreign account", async () => {
  const fixture = await systemDatabase.$transaction(async (db) => {
    const company = await db.organisation.create({
      data: {
        account_id: accountA,
        country_code: "AU",
        name: "Second manager company",
      },
    });
    const base = {
      email: "rls-manager@example.test",
      employment_type: "employee" as const,
      first_name: "RLS",
      last_name: "Manager",
      source_system: "MANUAL" as const,
    };
    const employee = await db.person.create({
      data: { ...base, account_id: accountA, organisation_id: companyA },
    });
    const manager = await db.person.create({
      data: { ...base, account_id: accountA, organisation_id: company.id },
    });
    const foreign = await db.person.create({
      data: { ...base, account_id: accountB, organisation_id: companyB },
    });
    return { company, employee, foreign, manager };
  });
  try {
    await withTenantDb(accountA, (db) =>
      db.person.update({
        data: { manager_person_id: fixture.manager.id },
        where: {
          account_id: accountA,
          id: fixture.employee.id,
          organisation_id: companyA,
        },
      })
    );
    await expect(
      withTenantDb(accountA, (db) =>
        db.person.update({
          data: { manager_person_id: fixture.foreign.id },
          where: {
            account_id: accountA,
            id: fixture.employee.id,
            organisation_id: companyA,
          },
        })
      )
    ).rejects.toThrow();
    expect(
      (
        await systemDatabase.person.findUnique({
          where: { id: fixture.employee.id },
        })
      )?.manager_person_id
    ).toBe(fixture.manager.id);
  } finally {
    await systemDatabase.person.deleteMany({
      where: {
        id: {
          in: [fixture.employee.id, fixture.manager.id, fixture.foreign.id],
        },
      },
    });
    await systemDatabase.organisation.delete({
      where: { id: fixture.company.id },
    });
  }
});

const ACCOUNT_SETTINGS_INSERT_PATTERN =
  /INSERT INTO "account_settings"[\s\S]+?ON CONFLICT \("clerk_org_id"\) DO NOTHING;/;
