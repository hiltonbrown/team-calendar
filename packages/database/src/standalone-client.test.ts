import { EventEmitter } from "node:events";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";

const { clientOptions, onQuery } = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  onQuery: vi.fn(),
}));
vi.mock("../generated/client", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      clientOptions(options);
    }
    $on = onQuery;
  },
}));
const { summaries } = vi.hoisted(() => ({ summaries: vi.fn() }));
vi.mock("@repo/observability/log", () => ({ log: { info: summaries } }));

import { createStandaloneDatabaseClient } from "./standalone-client";
import { withTenantQueryTiming } from "./tenant-query-timing";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("attributes queued pool queries to their originating requests", async () => {
  vi.stubEnv("TENANT_QUERY_TIMING", "1");
  class FakeClient extends EventEmitter {
    _queryable = true;
    _ending = false;
    connect(callback: (error: Error | null) => void) {
      setImmediate(() => callback(null));
    }
    query(
      sql: string,
      _values: unknown,
      callback: (error: Error | null, result: { rows: string[] }) => void
    ) {
      setImmediate(() => callback(null, { rows: [sql] }));
    }
    end(callback?: () => void) {
      callback?.();
    }
  }
  const pool = new Pool({ max: 1 });
  // Use pg's real queue and release logic with only its socket client replaced.
  Reflect.set(pool, "Client", FakeClient);
  createStandaloneDatabaseClient("postgresql://test:test@localhost/test");
  const adapter = clientOptions.mock.calls[0]?.[0].adapter;
  vi.spyOn(adapter, "connect").mockResolvedValue({
    underlyingDriver: () => pool,
  });
  await adapter.connect();
  try {
    const results = await Promise.all([
      withTenantQueryTiming("request-A", () => pool.query("query-A")),
      withTenantQueryTiming("request-B", () => pool.query("query-B")),
    ]);
    expect(results.map(({ rows }) => rows)).toEqual([["query-A"], ["query-B"]]);
    expect(summaries.mock.calls.map(([, summary]) => summary)).toEqual([
      expect.objectContaining({ operation: "request-A", statement_count: 1 }),
      expect.objectContaining({ operation: "request-B", statement_count: 1 }),
    ]);
  } finally {
    await pool.end();
  }
});

it("does not enable query events without explicit opt-in", () => {
  vi.stubEnv("TENANT_QUERY_TIMING", undefined);
  createStandaloneDatabaseClient("postgresql://test:test@localhost/test");
  expect(clientOptions).toHaveBeenCalledWith({ adapter: expect.anything() });
  expect(onQuery).not.toHaveBeenCalled();
});

it.each([
  "postgresql://test:test@localhost/test",
  "postgresql://test:test@preview.example.test/test",
])("counts driver BEGIN and COMMIT statements for %s", async (url) => {
  vi.stubEnv("TENANT_QUERY_TIMING", "1");
  createStandaloneDatabaseClient(url);
  const adapter = clientOptions.mock.calls[0]?.[0].adapter;
  const pool = Object.assign(new EventEmitter(), {
    connect: () => Promise.resolve(),
  });
  const delegate = {
    underlyingDriver: () => pool,
  };
  // Substitute the network boundary, while exercising the adapter wrapper.
  vi.spyOn(adapter, "connect").mockResolvedValue(delegate);
  await adapter.connect();
  const connection = {
    query: (sql: string) => Promise.resolve(sql),
  };
  pool.emit("connect", connection);
  await withTenantQueryTiming("calendar", async () => {
    for (const sql of ["BEGIN", "SELECT set_config", "SELECT 1", "COMMIT"]) {
      expect(await connection.query(sql)).toBe(sql);
    }
  });
  expect(summaries).toHaveBeenCalledWith(
    "tenant_query_timing",
    expect.objectContaining({ statement_count: 4 })
  );
  expect(onQuery).not.toHaveBeenCalled();
});
