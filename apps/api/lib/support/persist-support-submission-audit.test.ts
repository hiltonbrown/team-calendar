import type { AccountId, OrganisationId } from "@repo/core";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountId = "org_account_123" as AccountId;
const organisationId = "00000000-0000-4000-8000-000000000001" as OrganisationId;

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return {
    auditEvent: {
      create: mocks.create,
    },
  };
}

const { persistSupportSubmissionAudit } = await import(
  "./persist-support-submission-audit"
);

describe("persistSupportSubmissionAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the support submission audit event", async () => {
    mocks.create.mockResolvedValue({
      id: "audit_123",
    });

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId,
        category: "support",
        issueNumber: 42,
        issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/42",
        labelAssignmentSucceeded: true,
        labelsAttempted: ["support", "priority:normal"],
        organisationId,
        status: "created",
        subject: "Missing leave entry",
        userId: "user_123",
      }),
      (db) =>
        persistSupportSubmissionAudit(
          {
            accountId,
            category: "support",
            issueNumber: 42,
            issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/42",
            labelAssignmentSucceeded: true,
            labelsAttempted: ["support", "priority:normal"],
            organisationId,
            status: "created",
            subject: "Missing leave entry",
            userId: "user_123",
          },
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        account_id: "org_account_123",
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        entity_id: "42",
        entity_type: "support_submission",
        organisation_id: "00000000-0000-4000-8000-000000000001",
        payload: {
          category: "support",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/42",
          labelAssignmentSucceeded: true,
          labelsAttempted: ["support", "priority:normal"],
          status: "created",
          subject: "Missing leave entry",
        },
        resource_id: "42",
        resource_type: "support_submission",
      },
    });
  });

  it("propagates an audit write failure for entry-point rollback", async () => {
    mocks.create.mockRejectedValue(new Error("write failed"));

    const result = withTestTenantResult(
      tenantTestAccount({
        accountId,
        category: "feedback",
        issueNumber: 9,
        issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/9",
        labelAssignmentSucceeded: false,
        labelsAttempted: ["feedback", "priority:high"],
        organisationId,
        status: "created",
        subject: "Clarify save feedback",
        userId: "user_123",
      }),
      (db) =>
        persistSupportSubmissionAudit(
          {
            accountId,
            category: "feedback",
            issueNumber: 9,
            issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/9",
            labelAssignmentSucceeded: false,
            labelsAttempted: ["feedback", "priority:high"],
            organisationId,
            status: "created",
            subject: "Clarify save feedback",
            userId: "user_123",
          },
          db
        )
    );

    await expect(result).rejects.toThrow("write failed");
  });
});
