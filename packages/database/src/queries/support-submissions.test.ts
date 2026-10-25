import { withTenantResult as withTestTenantResult } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));

import type { AccountId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
    account_id: accountId,
    organisation_id: organisationId,
  })),
}));

vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        auditEvent: { findMany: mocks.findMany },
      }),
  },
}));

vi.mock("../tenant-query", () => ({
  scopedQuery: mocks.scopedQuery,
}));

const { listRecentSupportSubmissionAudits } = await import(
  "./support-submissions"
);

describe("listRecentSupportSubmissionAudits", () => {
  const tenant: { accountId: AccountId; organisationId: OrganisationId } = {
    accountId: "org_test_support_audits" as AccountId,
    organisationId: "65000000-0000-4000-8000-000000000001" as OrganisationId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests only support submission audit rows for the scoped tenant", async () => {
    mocks.findMany.mockResolvedValue([
      {
        account_id: tenant.accountId,
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        created_at: new Date("2026-04-22T00:00:00.000Z"),
        id: "audit_123",
        organisation_id: tenant.organisationId,
        payload: {
          category: "support",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/42",
          labelAssignmentSucceeded: true,
          labelsAttempted: ["support", "priority:normal"],
          status: "created",
          subject: "Missing leave entry",
        },
      },
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount(tenant.accountId),
      (db) =>
        listRecentSupportSubmissionAudits(
          tenant.accountId,
          tenant.organisationId,
          5,
          db
        )
    );

    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      select: {
        account_id: true,
        action: true,
        actor_user_id: true,
        created_at: true,
        id: true,
        organisation_id: true,
        payload: true,
      },
      take: 5,
      where: {
        account_id: tenant.accountId,
        action: "support_submissions.github_issue_created",
        organisation_id: tenant.organisationId,
      },
    });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          accountId: tenant.accountId,
          actorUserId: "user_123",
          category: "support",
          createdAt: new Date("2026-04-22T00:00:00.000Z"),
          id: "audit_123",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/42",
          labelAssignmentSucceeded: true,
          labelsAttempted: ["support", "priority:normal"],
          organisationId: tenant.organisationId,
          status: "created",
          subject: "Missing leave entry",
        },
      ],
    });
  });

  it("ignores audit rows with invalid payloads", async () => {
    mocks.findMany.mockResolvedValue([
      {
        account_id: tenant.accountId,
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        created_at: new Date("2026-04-22T00:00:00.000Z"),
        id: "audit_invalid",
        organisation_id: tenant.organisationId,
        payload: {
          category: "support",
          issueUrl: "not-a-url",
          status: "created",
          subject: "Broken payload",
        },
      },
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount(tenant.accountId),
      (db) =>
        listRecentSupportSubmissionAudits(
          tenant.accountId,
          tenant.organisationId,
          undefined,
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: [],
    });
  });
});
