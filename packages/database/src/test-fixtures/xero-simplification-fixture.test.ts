import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveTestFixture } from "../live-test-fixture";
import {
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./xero-simplification-fixture";

const mocks = vi.hoisted(() => ({
  allocate: vi.fn(),
  authorisationCreate: vi.fn(),
  connectionCreate: vi.fn(),
  organisationCreate: vi.fn(),
}));
vi.mock("../live-test-fixture", () => ({
  allocateLiveTestFixture: mocks.allocate,
}));
vi.mock("../live-test-guard", () => ({
  assertTestDatabaseConnectionAllowed: vi.fn(),
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../../generated/client", () => ({
  PrismaClient: class {
    organisation = { create: mocks.organisationCreate };
    xeroAuthorisation = { create: mocks.authorisationCreate };
    xeroConnection = { create: mocks.connectionCreate };
  },
}));

const suite = "packages/database/xero-tenancy.integration.test.ts";
const fixture: LiveTestFixture = {
  globalKey: (kind) => `owned-${kind}`,
  id: (kind, index = 0) => `${kind}-${index}`,
  key: (kind, index = 0) => `${kind}-key-${index}`,
  runId: "11111111-1111-4111-8111-111111111111",
  suite,
  tenants: [
    { accountId: "account-a", organisationId: "company-a" },
    { accountId: "account-b", organisationId: "company-b" },
  ],
};

describe("owned Xero simplification fixtures", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://owner@remote.neon.tech/development"
    );
    mocks.allocate.mockReturnValue(fixture);
    for (const create of [
      mocks.organisationCreate,
      mocks.authorisationCreate,
      mocks.connectionCreate,
    ]) {
      create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data)
      );
    }
  });

  it("accepts a remote target only through the guarded suite allocator", () => {
    const context = xeroSimplificationFixture(suite);
    expect(mocks.allocate).toHaveBeenCalledWith(suite);
    expect(context.fixture).toBe(fixture);
  });

  it("binds every committed tenant and canonical grant to owned identities", async () => {
    const { database } = xeroSimplificationFixture(suite);
    await createXeroConnectionFixture(database, fixture, 1);
    expect(mocks.organisationCreate).toHaveBeenCalledWith({
      data: {
        account_id: "account-b",
        country_code: "AU",
        id: "company-b",
        name: "Owned test payroll",
      },
    });
    expect(mocks.authorisationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "xero-authorisation-1",
        provider_app_id: "owned-provider_app",
        xero_user_id: "xero-user-1",
      }),
    });
    expect(mocks.connectionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        account_id: "account-b",
        organisation_id: "company-b",
        xero_authorisation_id: "xero-authorisation-1",
      }),
    });
  });

  it("refuses out-of-allocation company slots before inserting any rows", async () => {
    const { database } = xeroSimplificationFixture(suite);
    await expect(
      createXeroConnectionFixture(database, fixture, 2)
    ).rejects.toThrow("Fixture tenant slot is not allocated");
    expect(mocks.organisationCreate).not.toHaveBeenCalled();
    expect(mocks.authorisationCreate).not.toHaveBeenCalled();
    expect(mocks.connectionCreate).not.toHaveBeenCalled();
  });
});
