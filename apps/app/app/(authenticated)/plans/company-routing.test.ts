import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  failCreate: false,
  open: false,
  revalidate: vi.fn(),
  submit: vi.fn(),
  transaction: vi.fn(),
  writes: 0,
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../../../packages/database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/tenant-db")
  >("../../../../../packages/database/src/tenant-db")),
  resolveAccountCompanies: async () => companies,
}));
vi.mock("@repo/auth/server", () => ({
  auth: state.auth,
  currentUser: async () => {
    if (state.open) {
      throw new Error("Clerk ran inside transaction");
    }
    return await { id: "staff-B" };
  },
}));
vi.mock("@repo/availability", () => ({
  archiveRecord: vi.fn(),
  attachSubmitRecoveryCandidate: vi.fn(),
  createRecord: state.create,
  deleteDraftRecord: vi.fn(),
  listSubmitRecoveryCandidates: vi.fn(),
  resolveSubmitAsNotCreated: vi.fn(),
  restoreRecord: vi.fn(),
  retrySubmission: vi.fn(),
  revertToDraft: vi.fn(),
  submitDraftRecord: state.submit,
  updateRecord: vi.fn(),
  withdrawSubmission: vi.fn(),
}));
vi.mock("@repo/xero", () => ({ XeroWriteAdapter: {} }));
vi.mock("@repo/analytics/server", () => ({ analytics: null }));
vi.mock("@repo/analytics/activation-events", () => ({
  createActivationEvent: vi.fn(),
}));
vi.mock("@repo/observability/log", () => ({ log: { warn: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));

import { assertTenantDb, TenantPhaseError, withTenantDb } from "@repo/database";
import { createRecordAction, submitForApprovalAction } from "./_actions";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const recordId = "44444444-4444-4444-8444-444444444444";
const companies = [
  { id: companyA, name: "Company A" },
  { id: companyB, name: "Company B" },
];
const input = {
  allDay: true,
  contactabilityStatus: "contactable",
  endsAt: "2026-10-16",
  endTime: "",
  notesInternal: "",
  organisationId: companyB,
  personId,
  privacyMode: "named",
  recordType: "annual_leave",
  startsAt: "2026-10-15",
  startTime: "",
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.open = false;
  state.writes = 0;
  state.failCreate = false;
  state.auth.mockImplementation(async () => {
    if (state.open) {
      throw new Error("Auth ran inside transaction");
    }
    return await { orgId: "account-A", orgRole: "org:viewer" };
  });
  state.revalidate.mockImplementation(() => {
    expect(state.open).toBe(false);
  });
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Pool fake restores observable writes when the real Result sentinel rolls the request back.
      const before = state.writes;
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: {
          findFirst: async () => ({ organisation_id: companyB }),
        },
        organisation: { findFirst: async () => ({ timezone: "UTC" }) },
        person: { findFirst: async () => ({ organisation_id: companyB }) },
      } as unknown as Prisma.TransactionClient;
      state.open = true;
      try {
        return await run(db);
      } catch (error) {
        state.writes = before;
        throw error;
      } finally {
        state.open = false;
      }
    }
  );
  state.create.mockImplementation(async (query, db) => {
    assertTenantDb(db, query.clerkOrgId);
    expect(state.open).toBe(true);
    state.writes += 1;
    return (await state.failCreate)
      ? {
          error: {
            code: "validation_error",
            message: "Injected failed result",
          },
          ok: false,
        }
      : { ok: true, value: { id: recordId } };
  });
  state.submit.mockImplementation(async (query) => {
    expect(state.open).toBe(false);
    return await {
      ok: true,
      value: {
        approval_status: "submitted",
        id: query.recordId,
        submitted_at: null,
        xero_write_error: null,
      },
    };
  });
});
test("B-employed creation derives B and reuses one request Result scope", async () => {
  expect((await createRecordAction(input)).ok).toBe(true);
  expect(state.create.mock.calls[0]?.[0]).toMatchObject({
    clerkOrgId: "account-A",
    organisationId: companyB,
    personId,
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.writes).toBe(1);
  expect(state.revalidate).toHaveBeenCalled();
});
test("client company mismatch makes no mutation or provider call", async () => {
  expect(
    (await createRecordAction({ ...input, organisationId: companyA })).ok
  ).toBe(false);
  expect(state.create).not.toHaveBeenCalled();
  expect(state.submit).not.toHaveBeenCalled();
  expect(state.revalidate).not.toHaveBeenCalled();
});
test("failed mutation Result rolls back writes and discards revalidation", async () => {
  state.failCreate = true;
  expect((await createRecordAction(input)).ok).toBe(false);
  expect(state.writes).toBe(0);
  expect(state.revalidate).not.toHaveBeenCalled();
});
test("submission uses the owned record company after SQL preparation has closed", async () => {
  expect(
    (await submitForApprovalAction({ organisationId: companyB, recordId })).ok
  ).toBe(true);
  expect(state.submit.mock.calls[0]?.[0]).toMatchObject({
    actingUserId: "staff-B",
    organisationId: companyB,
    recordId,
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test("submission rejects a mismatched client company before Xero", async () => {
  expect(
    (await submitForApprovalAction({ organisationId: companyA, recordId })).ok
  ).toBe(false);
  expect(state.submit).not.toHaveBeenCalled();
});
test("Clerk action guard rejects an enclosing SQL scope before authentication", async () => {
  await expect(
    withTenantDb("account-A", () => createRecordAction(input))
  ).rejects.toBeInstanceOf(TenantPhaseError);
  expect(state.auth).not.toHaveBeenCalled();
});
