import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkOrgId = "org_clerk_123" as ClerkOrgId;
const organisationId = "00000000-0000-4000-8000-000000000001" as OrganisationId;

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  database: {
    auditEvent: {
      create: mocks.create,
    },
  },
}));

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

    const result = await persistSupportSubmissionAudit({
      category: "support",
      clerkOrgId,
      issueNumber: 42,
      issueUrl: "https://github.com/hiltonbrown/leavesync/issues/42",
      labelAssignmentSucceeded: true,
      labelsAttempted: ["support", "priority:normal"],
      organisationId,
      status: "created",
      subject: "Missing leave entry",
      userId: "user_123",
    });

    expect(result).toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        clerk_org_id: "org_clerk_123",
        entity_id: "42",
        entity_type: "support_submission",
        organisation_id: "00000000-0000-4000-8000-000000000001",
        payload: {
          category: "support",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/leavesync/issues/42",
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

  it("returns an internal error when the audit write fails", async () => {
    mocks.create.mockRejectedValue(new Error("write failed"));

    const result = await persistSupportSubmissionAudit({
      category: "feedback",
      clerkOrgId,
      issueNumber: 9,
      issueUrl: "https://github.com/hiltonbrown/leavesync/issues/9",
      labelAssignmentSucceeded: false,
      labelsAttempted: ["feedback", "priority:high"],
      organisationId,
      status: "created",
      subject: "Clarify save feedback",
      userId: "user_123",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "Failed to persist the support audit event.",
      },
    });
  });
});
