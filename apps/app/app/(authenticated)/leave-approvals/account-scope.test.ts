import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  auth: vi.fn(),
  open: false,
  people: vi.fn(),
  records: vi.fn(),
  role: "org:admin",
  send: vi.fn(),
  transaction: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => {
  const core = await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  );
  return {
    ...core,
    resolveAccountCompanies: async (
      account: string,
      db: Parameters<typeof core.assertTenantDb>[0]
    ) => {
      core.assertTenantDb(db, account);
      return await companies;
    },
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: state.auth,
  currentUser: async () => {
    if (state.open) {
      throw new Error("Clerk called inside SQL scope");
    }
    return await { id: "user-1" };
  },
}));
vi.mock("@repo/availability", () => ({
  approve: state.approve,
  decline: vi.fn(),
  managerScopePersonIds: async () => [reportId],
  prepareApprovalSync: async (
    input: { organisationId: string },
    runType: string
  ) => ({ ok: true, value: { ...input, runType } }),
  requestMoreInfo: vi.fn(),
  retryApproval: vi.fn(),
  retryDecline: vi.fn(),
  revertApprovalAttempt: vi.fn(),
  sendPreparedApprovalSync: state.send,
}));
vi.mock("@repo/xero", () => ({ XeroWriteAdapter: {} }));
vi.mock("@repo/analytics/server", () => ({ analytics: null }));
vi.mock("@repo/analytics/activation-events", () => ({
  createActivationEvent: vi.fn(),
}));
vi.mock("@repo/observability/log", () => ({ log: { warn: state.warn } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { TenantPhaseError, withTenantDb } from "@repo/database";
import { approveAction, dispatchXeroLeaveSyncAction } from "./_actions";

const companies = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Company A" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Company B" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Company C" },
];
const actorId = "44444444-4444-4444-8444-444444444444";
const reportId = "55555555-5555-4555-8555-555555555555";
const recordId = "66666666-6666-4666-8666-666666666666";
beforeEach(() => {
  vi.clearAllMocks();
  state.open = false;
  state.role = "org:admin";
  state.people.mockResolvedValue([{ id: actorId }]);
  state.auth.mockImplementation(async () => {
    if (state.open) {
      throw new Error("Auth called inside SQL scope");
    }
    return await { orgId: "account-A", orgRole: state.role };
  });
  state.records.mockResolvedValue({
    organisation_id: companies[1].id,
    person_id: reportId,
  });
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // The fake pool drives real tenant branding and scope closure around database preparation.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: { findFirst: state.records },
        person: {
          findFirst: async () => ({ id: actorId }),
          findMany: state.people,
        },
        xeroConnection: {
          findMany: async () =>
            companies.map((company) => ({ organisation_id: company.id })),
        },
      } as unknown as Prisma.TransactionClient;
      state.open = true;
      try {
        return await run(db);
      } finally {
        state.open = false;
      }
    }
  );
  state.approve.mockImplementation(async (input) => {
    if (state.open) {
      throw new Error("Provider approval called inside SQL scope");
    }
    return await {
      ok: true,
      value: {
        approvalStatus: "approved",
        approvedAt: null,
        failedAction: null,
        id: input.recordId,
        xeroWriteError: null,
      },
    };
  });
  state.send.mockImplementation(async () => {
    if (state.open) {
      throw new Error("Send called inside SQL scope");
    }
    return await { ok: true, value: { queued: true } };
  });
});
test("manager employed in A routes a B decision through the record-derived company", async () => {
  state.role = "org:manager";
  expect((await approveAction({ recordId })).ok).toBe(true);
  expect(state.approve.mock.calls[0]?.[0]).toMatchObject({
    actingPersonId: actorId,
    clerkOrgId: "account-A",
    organisationId: companies[1].id,
    recordId,
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test("missing/foreign record stops before any provider write", async () => {
  state.records.mockResolvedValue(null);
  expect((await approveAction({ recordId })).ok).toBe(false);
  expect(state.approve).not.toHaveBeenCalled();
});
test("duplicate acting people warn and keep the earliest match without blocking approval", async () => {
  state.people.mockResolvedValue([{ id: actorId }, { id: reportId }]);
  expect((await approveAction({ recordId })).ok).toBe(true);
  expect(state.approve.mock.calls[0]?.[0]).toMatchObject({
    actingPersonId: actorId,
  });
  expect(state.warn).toHaveBeenCalledWith(
    "Multiple person records match the approval actor",
    { clerkOrgId: "account-A", selectedPersonId: actorId }
  );
  expect(state.people).toHaveBeenCalledWith({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 2,
    where: {
      archived_at: null,
      clerk_org_id: "account-A",
      clerk_user_id: "user-1",
      organisation_id: { in: companies.map((company) => company.id) },
    },
  });
});
test("a single acting person does not produce a duplicate warning", async () => {
  expect((await approveAction({ recordId })).ok).toBe(true);
  expect(state.warn).not.toHaveBeenCalled();
});
test("an admin without a person can approve without a duplicate warning", async () => {
  state.people.mockResolvedValue([]);
  expect((await approveAction({ recordId })).ok).toBe(true);
  expect(state.approve.mock.calls[0]?.[0]).toMatchObject({
    actingPersonId: null,
  });
  expect(state.warn).not.toHaveBeenCalled();
});
test("a manager without a person cannot approve", async () => {
  state.role = "org:manager";
  state.people.mockResolvedValue([]);
  expect((await approveAction({ recordId })).ok).toBe(false);
  expect(state.approve).not.toHaveBeenCalled();
  expect(state.warn).not.toHaveBeenCalled();
});
test("one failed company dispatch does not prevent the third company from queuing", async () => {
  state.send.mockImplementation(async (input) => {
    expect(state.open).toBe(false);
    if (input.organisationId === companies[1].id) {
      throw new Error("Injected provider failure");
    }
    return await { ok: true, value: { queued: true } };
  });
  const result = await dispatchXeroLeaveSyncAction();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected per-company outcomes");
  }
  expect(
    result.value.companies.map((company) => [
      company.companyName,
      company.result.ok,
    ])
  ).toEqual([
    ["Company A", true],
    ["Company B", false],
    ["Company C", true],
  ]);
  expect(state.send).toHaveBeenCalledTimes(3);
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test("a manager cannot dispatch an account-wide sync", async () => {
  state.role = "org:manager";
  expect((await dispatchXeroLeaveSyncAction()).ok).toBe(false);
  expect(state.transaction).not.toHaveBeenCalled();
  expect(state.send).not.toHaveBeenCalled();
});
test("phased action rejects an enclosing transaction before Clerk authentication", async () => {
  await expect(
    withTenantDb("account-A", () => approveAction({ recordId }))
  ).rejects.toBeInstanceOf(TenantPhaseError);
  expect(state.auth).not.toHaveBeenCalled();
});
