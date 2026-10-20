// PrismaPg only. The plain-query assertion proves that client.query captures
// adapter SQL, so PostgreSQL log_statement parsing is unnecessary.
// All queries are read-only and need no fixture tables or elevated role.
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createRecordingTenantClient } from "./src/test-fixtures/statement-recorder";

const recordingFactory = vi.hoisted(() => ({
  getClient: (): ReturnType<typeof createRecordingTenantClient>["client"] => {
    throw new Error("Recording tenant client has not been initialised");
  },
}));

// Substitute only the adapter-backed client. Exercise the production tenant
// helpers and their lazy-client connection guard without copying their logic.
vi.mock("./src/standalone-client", () => ({
  createStandaloneDatabaseClient: () => recordingFactory.getClient(),
}));
vi.mock("server-only", () => ({}));

import {
  assertTenantDb,
  TenantMismatchError,
  withTenantDb,
} from "./src/tenant-db";

const clerkOrgId = "statement-recorder-account";
let recording: ReturnType<typeof createRecordingTenantClient> | undefined;

const recorder = () => {
  if (!recording) {
    throw new Error("Recording tenant client has not been initialised");
  }
  return recording;
};

beforeAll(() => {
  const connectionString =
    process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Statement-count integration tests require DATABASE_APP_URL or DATABASE_URL"
    );
  }
  recording = createRecordingTenantClient(connectionString);
  recordingFactory.getClient = () => recorder().client;
  vi.stubEnv("DATABASE_APP_URL", connectionString);
});

beforeEach(() => recorder().reset());

afterAll(async () => {
  try {
    await recording?.disconnect();
  } finally {
    vi.unstubAllEnvs();
  }
});

const expectTransactionStatements = (queryCount: number) => {
  const { statements } = recorder();
  expect(statements).toHaveLength(queryCount + 3);
  expect(statements[0]?.sql.trim()).toBe("BEGIN");
  expect(statements[1]?.sql).toContain("set_config('app.clerk_org_id'");
  expect(statements.at(-1)?.sql.trim()).toBe("COMMIT");
  expect(new Set(statements.map(({ connectionId }) => connectionId)).size).toBe(
    1
  );
};

test("the PrismaPg adapter sends a plain query through recorded client.query", async () => {
  expect(await recorder().client.$queryRaw`SELECT 1::int AS value`).toEqual([
    { value: 1 },
  ]);
  expect(recorder().statements).toHaveLength(1);
  expect(recorder().statements[0]?.sql).toBe("SELECT 1::int AS value");
  expect(recorder().events.map(({ phase }) => phase)).toEqual([
    "sent",
    "completed",
  ]);
});

test("one request-scoped query sends four statements", async () => {
  const rows = await withTenantDb(
    clerkOrgId,
    (db) => db.$queryRaw`
    SELECT current_setting('app.clerk_org_id') AS account, 1::int AS value
  `
  );
  expect(rows).toEqual([{ account: clerkOrgId, value: 1 }]);
  expectTransactionStatements(1);
  expect(recorder().statements[2]?.sql).toContain("1::int AS value");
});

test("three sequential request queries send six statements", async () => {
  const rows = await withTenantDb(clerkOrgId, async (tx) => {
    const first = await tx.$queryRaw`SELECT 1::int AS value`;
    const second = await tx.$queryRaw`SELECT 2::int AS value`;
    const third = await tx.$queryRaw`SELECT 3::int AS value`;
    return [first, second, third];
  });
  expect(rows).toEqual([[{ value: 1 }], [{ value: 2 }], [{ value: 3 }]]);
  expectTransactionStatements(3);
});

test("three request-scoped queries send six statements", async () => {
  const values = await withTenantDb(clerkOrgId, async (db) => {
    const first = await db.$queryRaw`SELECT 1::int AS value`;
    const second = await db.$queryRaw`SELECT 2::int AS value`;
    const third = await db.$queryRaw`SELECT 3::int AS value`;
    return [first, second, third];
  });
  expect(values).toEqual([[{ value: 1 }], [{ value: 2 }], [{ value: 3 }]]);
  expectTransactionStatements(3);
});

test("a mismatched request client sends no statement at assertion time", async () => {
  await withTenantDb(clerkOrgId, (db) => {
    const before = recorder().statements.length;
    expect(() => assertTenantDb(db, "another-account")).toThrow(
      TenantMismatchError
    );
    expect(recorder().statements).toHaveLength(before);
    return Promise.resolve();
  });
  expectTransactionStatements(0);
});

test("Promise.all serialises three tenant queries on one transaction connection", async () => {
  const rows = await withTenantDb(clerkOrgId, (tx) =>
    Promise.all([
      tx.$queryRaw`SELECT 11::int AS value, current_setting('app.clerk_org_id') AS account`,
      tx.$queryRaw`SELECT 22::int AS value, current_setting('app.clerk_org_id') AS account`,
      tx.$queryRaw`SELECT 33::int AS value, current_setting('app.clerk_org_id') AS account`,
    ])
  );
  expect(rows).toEqual([
    [{ account: clerkOrgId, value: 11 }],
    [{ account: clerkOrgId, value: 22 }],
    [{ account: clerkOrgId, value: 33 }],
  ]);
  expectTransactionStatements(3);
  expect(
    recorder()
      .statements.slice(2, 5)
      .map(({ sql }) => sql)
  ).toEqual([
    expect.stringContaining("11::int AS value"),
    expect.stringContaining("22::int AS value"),
    expect.stringContaining("33::int AS value"),
  ]);
  expect(recorder().events.map(({ phase }) => phase)).toEqual(
    Array.from({ length: 6 }, () => ["sent", "completed"]).flat()
  );
});
