import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { seedAuthDevelopmentFixtures } from "./auth-fixtures";

const mocks = vi.hoisted(() => ({
  assert: vi.fn(),
  auth: vi.fn(),
  location: vi.fn(),
  organisation: vi.fn(),
  person: vi.fn(),
  plans: vi.fn(),
  ready: vi.fn(),
  settings: vi.fn(),
  team: vi.fn(),
  tenant: vi.fn(),
}));
vi.mock("../tenant-db", () => ({ withTenantDb: mocks.tenant }));
vi.mock("../tenant-guard", () => ({ assertNoTenantTransaction: mocks.assert }));
vi.mock("./plan-sync", () => ({ syncPlansFromCatalogue: mocks.plans }));
const accounts = (["AU", "NZ", "UK"] as const).map((country, index) => ({
  accountId: `10000000-0000-4000-8000-00000000000${index}`,
  country,
  timeZone: ["Australia/Brisbane", "Pacific/Auckland", "Europe/London"][index],
  users: ["owner", "admin", "manager", "viewer"].map((role, roleIndex) => ({
    email: `${role}.${country.toLowerCase()}@teamcalendar.test`,
    role,
    userId: `20000000-0000-4000-800${index}-00000000000${roleIndex}`,
  })),
}));
// Only the owner readiness boundary is mocked; all domain query arguments are captured.
const owner = {
  authOrganization: { update: mocks.ready },
} as unknown as PrismaClient;
describe("scoped three-country domain fixtures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(accounts);
    mocks.plans.mockResolvedValue({ limits: 1, plans: 1 });
    mocks.tenant.mockImplementation(async (_accountId, callback) =>
      callback({
        accountSettings: { upsert: mocks.settings },
        location: { upsert: mocks.location },
        organisation: { upsert: mocks.organisation },
        person: { upsert: mocks.person },
        team: { upsert: mocks.team },
      })
    );
  });
  it("writes each country's companies, teams and all four People in its tenant scope before readiness", async () => {
    const result = await seedAuthDevelopmentFixtures(
      owner,
      "long-test-password",
      mocks.auth
    );
    expect(result).toMatchObject({ organisations: 3, people: 12, teams: 3 });
    expect(mocks.assert).toHaveBeenCalledWith("seedAuthDevelopmentFixtures");
    expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(
      owner,
      "long-test-password"
    );
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tenant.mock.invocationCallOrder[0]
    );
    expect(mocks.tenant.mock.calls.map(([accountId]) => accountId)).toEqual(
      accounts.map((account) => account.accountId)
    );
    for (const account of accounts) {
      expect(mocks.organisation).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            account_id: account.accountId,
            country_code: account.country,
          }),
          where: expect.objectContaining({ account_id: account.accountId }),
        })
      );
      for (const user of account.users) {
        expect(mocks.person).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              account_id: account.accountId,
              email: user.email,
              user_id: user.userId,
            }),
          })
        );
      }
    }
    expect(mocks.ready.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.settings.mock.invocationCallOrder[0]
    );
    const people = mocks.person.mock.calls.map(([args]) => args.create);
    for (const account of accounts) {
      const manager = people.find(
        (person) =>
          person.account_id === account.accountId &&
          person.last_name === "manager"
      );
      const viewer = people.find(
        (person) =>
          person.account_id === account.accountId &&
          person.last_name === "viewer"
      );
      expect(viewer.manager_person_id).toBe(manager.id);
      expect(viewer.team_id).toBe(manager.team_id);
    }
  });
  it("keeps the Account pending when domain provisioning fails", async () => {
    mocks.tenant.mockRejectedValue(
      new Error("fixture persistence unavailable")
    );
    await expect(
      seedAuthDevelopmentFixtures(owner, "long-test-password", mocks.auth)
    ).rejects.toThrow("fixture persistence unavailable");
    expect(mocks.ready).not.toHaveBeenCalled();
  });
  it("does not write domain data when auth fixture ownership is rejected", async () => {
    mocks.auth.mockRejectedValue(new Error("not owned"));
    await expect(
      seedAuthDevelopmentFixtures(owner, "long-test-password", mocks.auth)
    ).rejects.toThrow("not owned");
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.plans).not.toHaveBeenCalled();
  });
});
