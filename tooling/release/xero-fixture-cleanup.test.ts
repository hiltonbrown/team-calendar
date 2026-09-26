import { describe, expect, it, vi } from "vitest";
import {
  assertXeroCleanupFixturesOwned,
  assertXeroFixtureInfrastructureOwned,
  countXeroCleanupFixtures,
  countXeroFixtureInfrastructure,
  deleteXeroCleanupFixtures,
  deleteXeroFixtureInfrastructure,
  xeroFixtureInfrastructureKeys,
} from "./xero-fixture-cleanup.js";

const owned = {
  clerkOrgIds: ["clerk-owned"],
  globalKeys: [
    "credential_owner:owner",
    "oauth_attempt:attempt",
    "provider_app:app",
    "provider_connection:provider",
    "plan_id:plan",
  ],
  organisationIds: ["org-owned"],
};
const present = [{ present: true }, { present: true }, { present: true }];
function client(results: unknown[]) {
  const query = vi.fn(async (_sql: string, ..._values: unknown[]) =>
    _sql.includes("to_regclass('public.xero_cleanup_requests')")
      ? [{ present: false }, { present: false }]
      : results.shift()
  );
  return {
    $executeRawUnsafe: vi.fn(async (_sql: string, ..._values: unknown[]) => 1),
    $queryRawUnsafe: async <T>(
      sql: string,
      ...values: unknown[]
    ): Promise<T> => {
      // This test harness returns the caller-selected query result type.
      return (await query(sql, ...values)) as T;
    },
    query,
  };
}

describe("owned Xero infrastructure cleanup", () => {
  it("uses only kind-qualified manifest keys", () => {
    expect(xeroFixtureInfrastructureKeys(owned)).toEqual({
      attemptIds: ["attempt"],
      ownerIds: ["owner"],
      providerApps: ["app"],
      providerConnectionIds: ["provider"],
    });
  });
  it("counts no infrastructure before the additive migration", async () => {
    const database = client([
      [{ present: false }, { present: false }, { present: false }],
    ]);
    expect(await countXeroFixtureInfrastructure(database, owned)).toEqual({});
    expect(database.query).toHaveBeenCalledTimes(2);
  });
  it.each([{ evidence: [] }, { evidence: [{ present: false }] }])(
    "rejects incomplete infrastructure table evidence %j",
    async ({ evidence }) => {
      await expect(
        countXeroFixtureInfrastructure(client([evidence]), owned)
      ).rejects.toThrow("complete table evidence");
    }
  );
  it("refuses a partial migration", async () => {
    await expect(
      countXeroFixtureInfrastructure(
        client([[{ present: true }, { present: false }, { present: false }]]),
        owned
      )
    ).rejects.toThrow("complete migration");
  });
  it("refuses an owned owner or provider linked to an unowned binding", async () => {
    const database = client([present, [{ unsafe: true }]]);
    await expect(
      assertXeroFixtureInfrastructureOwned(database, owned)
    ).rejects.toThrow("unowned data");
    expect(database.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(database.query.mock.calls[2]?.slice(1)).toEqual([
      ["owner"],
      ["app"],
      ["provider"],
      ["attempt"],
      ["clerk-owned"],
      ["org-owned"],
    ]);
  });
  it("allows only a positively verified owned infrastructure selection", async () => {
    await expect(
      assertXeroFixtureInfrastructureOwned(
        client([present, [{ unsafe: false }]]),
        owned
      )
    ).resolves.toBeUndefined();
    await expect(
      assertXeroFixtureInfrastructureOwned(client([present, []]), owned)
    ).rejects.toThrow("unowned data");
  });
  it("includes all infrastructure residue counts", async () => {
    expect(
      await countXeroFixtureInfrastructure(
        client([present, [{ attempts: 3n, owners: 1n, providers: 2n }]]),
        owned
      )
    ).toEqual({
      xero_credential_owners: 1,
      xero_provider_connections: 2,
      xero_refresh_attempts: 3,
    });
  });
  it("deletes children before owners with only manifest-owned keys", async () => {
    const database = client([present]);
    await deleteXeroFixtureInfrastructure(database, owned);
    expect(database.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    const [attemptDelete, providerDelete, ownerDelete] =
      database.$executeRawUnsafe.mock.calls;
    expect(attemptDelete?.[0]).toContain("DELETE FROM xero_refresh_attempts");
    expect(attemptDelete?.slice(1)).toEqual([["attempt"], ["owner"], ["app"]]);
    expect(providerDelete?.[0]).toContain(
      "DELETE FROM xero_provider_connections"
    );
    expect(providerDelete?.slice(1)).toEqual([
      ["provider"],
      ["app"],
      ["owner"],
    ]);
    expect(ownerDelete?.[0]).toContain("DELETE FROM xero_credential_owners");
    expect(ownerDelete?.slice(1)).toEqual([["owner"], ["app"]]);
  });
});

describe("cleanup request fixture ownership", () => {
  const cleanupOwned = {
    ...owned,
    globalKeys: [
      ...owned.globalKeys,
      "cleanup_request:request",
      "cleanup_attempt:cleanup",
    ],
  };
  function cleanupClient(unsafe = false) {
    return {
      $executeRawUnsafe: vi.fn(
        async (_sql: string, ..._values: unknown[]) => 1
      ),
      $queryRawUnsafe: <T>(sql: string): Promise<T> => {
        let result: unknown = [{ attempts: 2n, requests: 1n }];
        if (sql.includes("to_regclass")) {
          result = [{ present: true }, { present: true }];
        } else if (sql.includes("AS unsafe")) {
          result = [{ unsafe }];
        }
        // Test harness returns the explicitly selected query result.
        return Promise.resolve(result as T);
      },
    };
  }
  it.each([{ evidence: [] }, { evidence: [{ present: false }] }])(
    "rejects incomplete cleanup table evidence %j",
    async ({ evidence }) => {
      const database = {
        $executeRawUnsafe: vi.fn(
          async (_sql: string, ..._values: unknown[]) => 1
        ),
        $queryRawUnsafe: <T>(): Promise<T> => {
          // This harness deliberately supplies incomplete database evidence.
          return Promise.resolve(evidence as T);
        },
      };
      await expect(
        deleteXeroCleanupFixtures(database, cleanupOwned)
      ).rejects.toThrow("complete table evidence");
      expect(database.$executeRawUnsafe).not.toHaveBeenCalled();
    }
  );
  it("refuses key/scope/FK ownership mismatches without deleting", async () => {
    const database = cleanupClient(true);
    await expect(
      deleteXeroCleanupFixtures(database, cleanupOwned)
    ).rejects.toThrow("unowned data");
    expect(database.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it("binds exactly the numbered placeholders required by each cleanup DELETE", async () => {
    const database = cleanupClient();
    await deleteXeroCleanupFixtures(database, cleanupOwned);
    for (const [sql, ...values] of database.$executeRawUnsafe.mock.calls) {
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((match) =>
        Number(match[1])
      );
      expect(values).toHaveLength(Math.max(...placeholders));
    }
    expect(database.$executeRawUnsafe.mock.calls[1]?.slice(1)).toEqual([
      ["clerk-owned"],
      ["org-owned"],
      ["request"],
    ]);
  });
  it("counts both selectors and deletes attempts before their requests", async () => {
    const database = cleanupClient();
    expect(await countXeroCleanupFixtures(database, cleanupOwned)).toEqual({
      xero_cleanup_attempts: 2,
      xero_cleanup_requests: 1,
    });
    await assertXeroCleanupFixturesOwned(database, cleanupOwned);
    await deleteXeroCleanupFixtures(database, cleanupOwned);
    expect(database.$executeRawUnsafe.mock.calls[0]?.[0]).toContain(
      "DELETE FROM xero_cleanup_attempts"
    );
    expect(database.$executeRawUnsafe.mock.calls[1]?.[0]).toContain(
      "DELETE FROM xero_cleanup_requests"
    );
    expect(database.$executeRawUnsafe.mock.calls[0]?.slice(1)).toEqual([
      ["clerk-owned"],
      ["org-owned"],
      ["request"],
      ["cleanup"],
    ]);
  });
});
