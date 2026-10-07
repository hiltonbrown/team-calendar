import { describe, expect, it, vi } from "vitest";
import {
  assertXeroFixtureInfrastructureOwned,
  countXeroFixtureInfrastructure,
  deleteXeroFixtureInfrastructure,
  xeroFixtureInfrastructureKeys,
} from "./xero-fixture-cleanup.js";

const owned = {
  clerkOrgIds: ["clerk-owned"],
  globalKeys: ["authorisation:grant", "provider_app:app", "plan_id:plan"],
  organisationIds: ["org-owned"],
};
function client(results: unknown[]) {
  const query = vi.fn(async (_sql: string, ..._values: unknown[]) =>
    results.shift()
  );
  return {
    $executeRawUnsafe: vi.fn(async (_sql: string, ..._values: unknown[]) => 1),
    $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]): Promise<T> =>
      (await query(sql, ...values)) as T,
    query,
  };
}
describe("owned canonical Xero authorisation cleanup", () => {
  it("selects only qualified canonical grant and provider app keys", () => {
    expect(xeroFixtureInfrastructureKeys(owned)).toEqual({
      authorisationIds: ["grant"],
      providerApps: ["app"],
    });
  });
  it("requires the canonical schema before cleanup", async () => {
    await expect(
      countXeroFixtureInfrastructure(client([[{ present: false }]]), owned)
    ).rejects.toThrow("canonical Xero schema");
  });
  it("rejects incomplete schema evidence", async () => {
    await expect(
      countXeroFixtureInfrastructure(client([[]]), owned)
    ).rejects.toThrow("canonical Xero schema");
  });
  it("refuses a shared grant referenced by another account or organisation", async () => {
    const database = client([[{ present: true }], [{ unsafe: true }]]);
    await expect(
      assertXeroFixtureInfrastructureOwned(database, owned)
    ).rejects.toThrow("unowned data");
    expect(database.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(database.query.mock.calls[1]?.slice(1)).toEqual([
      ["grant"],
      ["app"],
      ["clerk-owned"],
      ["org-owned"],
    ]);
    expect(database.query.mock.calls[1]?.[0]).toContain("xero_oauth_sessions");
    expect(database.query.mock.calls[1]?.[0]).toContain("xero_connections");
  });
  it("requires positive ownership evidence", async () => {
    await expect(
      assertXeroFixtureInfrastructureOwned(
        client([[{ present: true }], []]),
        owned
      )
    ).rejects.toThrow("unowned data");
  });
  it("counts canonical infrastructure residue", async () => {
    expect(
      await countXeroFixtureInfrastructure(
        client([[{ present: true }], [{ authorisations: 2n }]]),
        owned
      )
    ).toEqual({ xero_authorisations: 2 });
  });
  it("deletes only manifest-owned grants after positively checking references", async () => {
    const database = client([[{ present: true }], [{ unsafe: false }]]);
    await deleteXeroFixtureInfrastructure(database, owned);
    expect(database.$executeRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("DELETE FROM xero_authorisations"),
      ["grant"],
      ["app"]
    );
  });
});
