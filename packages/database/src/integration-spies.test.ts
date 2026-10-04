import { describe, expect, it, vi } from "vitest";
import { createSpyableDatabase } from "./integration-spies";
import {
  createWriteGuardedClient,
  withDatabaseWriteGuard,
} from "./write-guard";

function fixture() {
  const create = vi.fn(async () => ({ id: "owned" }));
  const findMany = vi.fn(async () => [{ id: "owned" }]);
  const upsert = vi.fn(async () => ({ id: "owned" }));
  const transaction = {
    xeroCleanupRequest: { create },
    xeroProviderConnection: { upsert },
    xeroRefreshAttempt: { findMany },
  };
  const client = createWriteGuardedClient({
    ...transaction,
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>
    ) => callback(transaction),
  });
  return { client, create, findMany, upsert };
}

describe("integration database spies", () => {
  it("preserves the database write guard when a spied create forwards and restores", async () => {
    const { client, create } = fixture();
    const database = createSpyableDatabase(client, {
      xeroCleanupRequest: ["create"],
      xeroProviderConnection: ["upsert"],
      xeroRefreshAttempt: ["findMany"],
    });
    const guard = vi.fn(async () => undefined);
    const spy = vi.spyOn(database.xeroCleanupRequest, "create");
    await withDatabaseWriteGuard(guard, () =>
      database.xeroCleanupRequest.create()
    );
    expect(guard).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
    await withDatabaseWriteGuard(guard, () =>
      database.xeroCleanupRequest.create()
    );
    expect(guard).toHaveBeenCalledTimes(4);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("limits maintenance discovery through an own spy without replacing the guarded client", async () => {
    const { client, findMany } = fixture();
    const database = createSpyableDatabase(client, {
      xeroCleanupRequest: ["create"],
      xeroProviderConnection: ["upsert"],
      xeroRefreshAttempt: ["findMany"],
    });
    const spy = vi
      .spyOn(database.xeroRefreshAttempt, "findMany")
      .mockResolvedValueOnce([]);
    expect(await database.xeroRefreshAttempt.findMany()).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(await database.xeroRefreshAttempt.findMany()).toEqual([
      { id: "owned" },
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });

  it("injects one inventory persistence failure then restores the real operation", async () => {
    const { client, upsert } = fixture();
    const database = createSpyableDatabase(client, {
      xeroCleanupRequest: ["create"],
      xeroProviderConnection: ["upsert"],
      xeroRefreshAttempt: ["findMany"],
    });
    const spy = vi
      .spyOn(database.xeroProviderConnection, "upsert")
      .mockRejectedValueOnce(new Error("fixture failure"));
    await expect(database.xeroProviderConnection.upsert()).rejects.toThrow(
      "fixture failure"
    );
    spy.mockRestore();
    expect(await database.xeroProviderConnection.upsert()).toEqual({
      id: "owned",
    });
    expect(upsert).toHaveBeenCalledOnce();
  });
  it("resolves a new guarded invocation after first use inside another", async () => {
    const { client, create } = fixture();
    const database = createSpyableDatabase(client, {
      xeroCleanupRequest: ["create"],
    });
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    await withDatabaseWriteGuard(first, () =>
      database.xeroCleanupRequest.create()
    );
    await withDatabaseWriteGuard(second, () =>
      database.xeroCleanupRequest.create()
    );
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    await database.xeroCleanupRequest.create();
    expect(create).toHaveBeenCalledTimes(3);
  });
});
