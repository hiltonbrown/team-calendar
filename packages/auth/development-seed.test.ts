import type { PrismaClient } from "@repo/database";
import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  developmentSeedMarker,
  seedDevelopmentAuthAccounts,
} from "./development-seed";

type Storage = Record<string, Record<string, unknown>[]>;
const mocks = vi.hoisted(() => ({ failMembership: false }));
vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter:
    (tx: { storage: Storage }, config: { transaction: boolean }) =>
    (options: BetterAuthOptions) => {
      const base = memoryAdapter(tx.storage)(options);
      return {
        ...base,
        create: (args: Parameters<typeof base.create>[0]) => {
          if (mocks.failMembership && args.model === "member") {
            throw new Error("Membership write failed");
          }
          return base.create(args);
        },
        options: {
          ...base.options,
          adapterConfig: {
            ...base.options?.adapterConfig,
            transaction: config.transaction,
          },
        },
        transaction: async <T>(
          callback: (adapter: typeof base) => Promise<T>
        ) => callback(base),
      };
    },
}));
const empty = (): Storage =>
  Object.fromEntries(
    [
      "AuthUser",
      "AuthSession",
      "AuthIdentity",
      "AuthVerification",
      "AuthOrganization",
      "AuthMember",
      "AuthInvitation",
    ].map((key) => [key, []])
  );
function fixture(storage: Storage) {
  const delegate = (local: Storage) => ({
    authOrganization: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; slug?: string } }) =>
          local.AuthOrganization.find((account) =>
            where.id ? account.id === where.id : account.slug === where.slug
          ) ?? null
      ),
    },
    authUser: {
      findUnique: vi.fn(({ where }: { where: { email: string } }) => {
        const user = local.AuthUser.find((row) => row.email === where.email);
        return Promise.resolve(
          user
            ? {
                ...user,
                memberships: local.AuthMember.filter(
                  (member) => member.user_id === user.id
                ),
              }
            : null
        );
      }),
    },
    storage: local,
  });
  // A Prisma-boundary test double owns the real outer commit. Native Better Auth
  // uses its real mapped memory adapter inside this isolated transaction copy.
  const database = {
    ...delegate(storage),
    $transaction: vi.fn(
      async (
        callback: (tx: ReturnType<typeof delegate>) => Promise<unknown>
      ) => {
        const transaction = structuredClone(storage);
        const result = await callback(delegate(transaction));
        for (const key of Object.keys(storage)) {
          storage[key] = transaction[key];
        }
        return result;
      }
    ),
  };
  return database as unknown as PrismaClient;
}
const password = "A sufficiently long fixture password";

describe("native Better Auth development seed", () => {
  beforeEach(() => {
    mocks.failMembership = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error(
          "Development fixtures must never send network requests"
        );
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("creates exactly three verified Accounts with all four native roles and no network or persistent sessions", async () => {
    const storage = empty();
    const summary = await seedDevelopmentAuthAccounts(fixture(storage), {
      password,
    });
    expect(summary.map((account) => account.country)).toEqual([
      "AU",
      "NZ",
      "UK",
    ]);
    expect(storage.AuthOrganization).toHaveLength(3);
    expect(storage.AuthUser).toHaveLength(12);
    expect(storage.AuthMember).toHaveLength(12);
    expect(storage.AuthIdentity).toHaveLength(12);
    expect(storage.AuthSession).toHaveLength(0);
    for (const account of summary) {
      expect(account.users.map((user) => user.role)).toEqual([
        "owner",
        "admin",
        "manager",
        "viewer",
      ]);
      expect(
        storage.AuthOrganization.find((row) => row.id === account.accountId)
      ).toMatchObject({ country_code: account.country });
      for (const user of account.users) {
        expect(
          storage.AuthUser.find((row) => row.id === user.userId)
        ).toMatchObject({ email_verified: true });
        expect(
          storage.AuthMember.find((row) => row.user_id === user.userId)
        ).toMatchObject({ account_id: account.accountId, role: user.role });
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  }, 30_000);
  it("reuses only its owned fixture users and Accounts on rerun", async () => {
    const storage = empty(),
      db = fixture(storage);
    const first = await seedDevelopmentAuthAccounts(db, { password });
    expect(await seedDevelopmentAuthAccounts(db, { password })).toEqual(first);
    expect(storage.AuthOrganization).toHaveLength(3);
    expect(storage.AuthUser).toHaveLength(12);
    expect(storage.AuthSession).toHaveLength(0);
    await expect(
      seedDevelopmentAuthAccounts(db, { password: `${password} changed` })
    ).rejects.toThrow();
    expect(storage.AuthUser).toHaveLength(12);
    expect(storage.AuthOrganization).toHaveLength(3);
  }, 30_000);
  it("rolls back the outer transaction when native membership bootstrap fails", async () => {
    const storage = empty();
    mocks.failMembership = true;
    await expect(
      seedDevelopmentAuthAccounts(fixture(storage), { password })
    ).rejects.toThrow();
    expect(storage.AuthUser).toHaveLength(0);
    expect(storage.AuthOrganization).toHaveLength(0);
    expect(storage.AuthMember).toHaveLength(0);
  });
  it("refuses a foreign Account collision before creating any identity", async () => {
    const storage = empty();
    storage.AuthOrganization.push({
      country_code: "AU",
      id: "foreign",
      metadata: "{}",
      slug: "team-calendar-seed-au",
    });
    await expect(
      seedDevelopmentAuthAccounts(fixture(storage), { password })
    ).rejects.toThrow("not owned");
    expect(storage.AuthUser).toHaveLength(0);
  });
  it("refuses to adopt an existing email without its owned membership", async () => {
    const storage = empty();
    storage.AuthOrganization.push({
      country_code: "AU",
      id: "foreign",
      metadata: JSON.stringify({ developmentSeed: developmentSeedMarker }),
      slug: "team-calendar-seed-au",
    });
    storage.AuthUser.push({
      email: "owner.au@teamcalendar.test",
      id: "foreign-user",
    });
    await expect(
      seedDevelopmentAuthAccounts(fixture(storage), { password })
    ).rejects.toThrow("not owned");
    expect(storage.AuthUser).toHaveLength(1);
  });
  it("refuses production and unsuitable passwords", async () => {
    const storage = empty();
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      seedDevelopmentAuthAccounts(fixture(storage), { password })
    ).rejects.toThrow("production");
    vi.stubEnv("NODE_ENV", "test");
    await expect(
      seedDevelopmentAuthAccounts(fixture(storage), { password: "short" })
    ).rejects.toThrow();
    expect(storage.AuthUser).toHaveLength(0);
  });
});
