import type { Result } from "@repo/core";
import { beforeEach, expect, test, vi } from "vitest";
import type { Prisma } from "../generated/client";

const state = vi.hoisted(() => ({
  clients: [] as Prisma.TransactionClient[],
  events: [] as string[],
  log: vi.fn(),
  report: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/observability/log", () => ({ log: { error: state.log } }));
vi.mock("@repo/observability/error", () => ({ parseError: state.report }));

import {
  afterTenantCommit,
  assertNoTenantTransaction,
  assertTenantDb,
  isTenantScopeActive,
  TENANT_READ_TRANSACTION_OPTIONS,
  TENANT_REQUEST_OPTIONS,
  type TenantDb,
  TenantMismatchError,
  TenantNestingError,
  TenantPhaseError,
  withTenantDb,
  withTenantReads,
  withTenantResult,
} from "./tenant-db";

test("assertTenantDb rejects a revoked client", async () => {
  const revoked = await withTenantDb("account-A", (db) => Promise.resolve(db));
  expect(() => assertTenantDb(revoked, "account-A")).toThrow(
    TenantMismatchError
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  state.events.length = 0;
  state.clients.length = 0;
  state.transaction.mockImplementation(
    async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const client = {
        $queryRaw: vi.fn(() => {
          state.events.push("context");
          return Promise.resolve([]);
        }),
      };
      // The test substitutes the pool boundary with only the methods it uses.
      const tx = client as unknown as Prisma.TransactionClient;
      state.clients.push(tx);
      state.events.push("begin");
      try {
        const value = await fn(tx);
        state.events.push("commit");
        return value;
      } catch (error) {
        state.events.push("rollback");
        throw error;
      }
    }
  );
});

test("sets transaction-local context once and returns the callback value", async () => {
  const value = await withTenantDb("account-A", (db) => {
    expect(db).toBe(state.clients[0]);
    expect(isTenantScopeActive()).toBe(true);
    return Promise.resolve("data");
  });
  expect(value).toBe("data");
  expect(state.events).toEqual(["begin", "context", "commit"]);
  const query = state.clients[0]?.$queryRaw;
  expect(query).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledWith(
    ["SELECT set_config('app.account_id', ", ", true)"],
    "account-A"
  );
  expect(state.transaction).toHaveBeenCalledWith(
    expect.any(Function),
    TENANT_REQUEST_OPTIONS
  );
  expect(isTenantScopeActive()).toBe(false);
});

test("preserves explicit transaction options and the account-wide preset", async () => {
  await withTenantDb(
    "account-A",
    () => Promise.resolve(),
    TENANT_READ_TRANSACTION_OPTIONS
  );
  expect(state.transaction).toHaveBeenCalledWith(expect.any(Function), {
    maxWait: 10_000,
    timeout: 30_000,
  });
});

test("rejects nested transactions before a second pool call", async () => {
  await expect(
    withTenantDb("account-A", () =>
      withTenantDb("account-A", () => Promise.resolve())
    )
  ).rejects.toBeInstanceOf(TenantNestingError);
  expect(state.transaction).toHaveBeenCalledOnce();
});

test("checks account ownership and rejects unregistered clients", async () => {
  await withTenantDb("account-A", (db) => {
    expect(() => assertTenantDb(db, "account-A")).not.toThrow();
    expect(() => assertTenantDb(db, "account-B")).toThrow(TenantMismatchError);
    // Deliberately bypass the static brand to exercise its runtime defence.
    expect(() => assertTenantDb({} as TenantDb, "account-A")).toThrow(
      TenantMismatchError
    );
    return Promise.resolve();
  });
});

test("effects run in registration order after commit and outside the scope", async () => {
  await withTenantDb("account-A", (db) => {
    afterTenantCommit(db, () => {
      expect(isTenantScopeActive()).toBe(false);
      state.events.push("effect-one");
      return withTenantDb("account-B", () => Promise.resolve());
    });
    afterTenantCommit(db, () => {
      state.events.push("effect-two");
      return Promise.resolve();
    });
    expect(state.events).not.toContain("effect-one");
    return Promise.resolve();
  });
  expect(state.events).toEqual([
    "begin",
    "context",
    "commit",
    "effect-one",
    "begin",
    "context",
    "commit",
    "effect-two",
  ]);
});

test("does not run registered effects after callback failure", async () => {
  const effect = vi.fn(() => Promise.resolve());
  const failure = new Error("failed write");
  await expect(
    withTenantDb("account-A", (db) => {
      afterTenantCommit(db, effect);
      return Promise.reject(failure);
    })
  ).rejects.toBe(failure);
  expect(state.events).toEqual(["begin", "context", "rollback"]);
  expect(effect).not.toHaveBeenCalled();
});

test("does not run registered effects after commit failure", async () => {
  const effect = vi.fn(() => Promise.resolve());
  const commitFailure = new Error("commit unavailable");
  const transaction = state.transaction.getMockImplementation();
  state.transaction.mockImplementationOnce(async (...args) => {
    await transaction?.(...args);
    throw commitFailure;
  });
  await expect(
    withTenantDb("account-A", (db) => {
      afterTenantCommit(db, effect);
      return Promise.resolve();
    })
  ).rejects.toBe(commitFailure);
  expect(effect).not.toHaveBeenCalled();
});

test("retries a failed effect once without reporting a recovered failure", async () => {
  const effect = vi
    .fn()
    .mockRejectedValueOnce(new Error("transient"))
    .mockResolvedValueOnce(undefined);
  await withTenantDb("account-A", (db) => {
    afterTenantCommit(db, effect);
    return Promise.resolve();
  });
  expect(effect).toHaveBeenCalledTimes(2);
  expect(state.log).not.toHaveBeenCalled();
  expect(state.report).not.toHaveBeenCalled();
});

test("reports a twice-failed effect and continues to later effects", async () => {
  const failure = new Error("effect failed");
  const effect = vi.fn(() => Promise.reject(failure));
  const next = vi.fn(() => Promise.resolve());
  await expect(
    withTenantDb("account-A", (db) => {
      afterTenantCommit(db, effect);
      afterTenantCommit(db, next);
      return Promise.resolve("committed");
    })
  ).resolves.toBe("committed");
  expect(effect).toHaveBeenCalledTimes(2);
  expect(state.log).toHaveBeenCalledOnce();
  expect(state.report).toHaveBeenCalledWith(failure);
  expect(next).toHaveBeenCalledOnce();
});

test("reporting failures cannot reject an already committed request", async () => {
  state.log.mockImplementationOnce(() => {
    throw new Error("logger down");
  });
  state.report.mockImplementationOnce(() => {
    throw new Error("reporter down");
  });
  await expect(
    withTenantDb("account-A", (db) => {
      afterTenantCommit(db, () => Promise.reject(new Error("effect failed")));
      return Promise.resolve("committed");
    })
  ).resolves.toBe("committed");
});

test("withTenantResult rolls back writes and returns the original failed Result", async () => {
  const result: Result<never, string> = { error: "denied", ok: false };
  const effect = vi.fn(() => Promise.resolve());
  expect(
    await withTenantResult("account-A", (db) => {
      afterTenantCommit(db, effect);
      return Promise.resolve(result);
    })
  ).toBe(result);
  expect(state.events).toEqual(["begin", "context", "rollback"]);
  expect(effect).not.toHaveBeenCalled();
});

test("withTenantResult commits and returns the original successful Result", async () => {
  const result: Result<string, never> = { ok: true, value: "data" };
  expect(
    await withTenantResult("account-A", () => Promise.resolve(result))
  ).toBe(result);
  expect(state.events).toEqual(["begin", "context", "commit"]);
});

test("withTenantResult does not convert an unexpected exception into a Result", async () => {
  const failure = new Error("unexpected");
  await expect(
    withTenantResult("account-A", () => Promise.reject(failure))
  ).rejects.toBe(failure);
});

test("phased flows reject an active scope and pass outside one", async () => {
  expect(() => assertNoTenantTransaction("xero-write")).not.toThrow();
  await withTenantDb("account-A", () => {
    expect(() => assertNoTenantTransaction("xero-write")).toThrow(
      TenantPhaseError
    );
    return Promise.resolve();
  });
});

test("fan-out branches run concurrently in distinct transactions and return keyed values", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: string[] = [];
  const result = await withTenantReads("account-A", {
    first: async (db) => {
      assertTenantDb(db, "account-A");
      started.push("first");
      await gate;
      return 1;
    },
    second: (db) => {
      assertTenantDb(db, "account-A");
      expect(started).toEqual(["first"]);
      release?.();
      return Promise.resolve(2);
    },
  });
  expect(result).toEqual({ first: 1, second: 2 });
  expect(state.clients[0]).not.toBe(state.clients[1]);
  expect(state.transaction).toHaveBeenCalledTimes(2);
});

test("fan-out cannot start within an existing tenant transaction", async () => {
  await expect(
    withTenantDb("account-A", () =>
      withTenantReads("account-A", {
        first: () => Promise.resolve(1),
      })
    )
  ).rejects.toBeInstanceOf(TenantNestingError);
  expect(state.transaction).toHaveBeenCalledOnce();
});

test.each(["", "   "])(
  "rejects blank context %j without pool access",
  async (account) => {
    await expect(
      withTenantDb(account, () => Promise.resolve())
    ).rejects.toThrow("Account");
    expect(state.transaction).not.toHaveBeenCalled();
  }
);
