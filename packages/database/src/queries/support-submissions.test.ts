import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("../client", () => ({
  database: {
    auditEvent: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("../tenant-query", () => ({
  scopedQuery: mocks.scopedQuery,
}));

const { listRecentSupportSubmissionAudits } = await import(
  "./support-submissions"
);

describe("listRecentSupportSubmissionAudits", () => {
  const tenant: { clerkOrgId: ClerkOrgId; organisationId: OrganisationId } = {
    clerkOrgId: "org_test_support_audits" as ClerkOrgId,
    organisationId: "65000000-0000-4000-8000-000000000001" as OrganisationId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests only support submission audit rows for the scoped tenant", async () => {
    mocks.findMany.mockResolvedValue([
      {
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        clerk_org_id: tenant.clerkOrgId,
        created_at: new Date("2026-04-22T00:00:00.000Z"),
        id: "audit_123",
        organisation_id: tenant.organisationId,
        payload: {
          category: "support",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/leavesync/issues/42",
          labelAssignmentSucceeded: true,
          labelsAttempted: ["support", "priority:normal"],
          status: "created",
          subject: "Missing leave entry",
        },
      },
    ]);

    const result = await listRecentSupportSubmissionAudits(
      tenant.clerkOrgId,
      tenant.organisationId,
      5
    );

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        action: "support_submissions.github_issue_created",
        clerk_org_id: tenant.clerkOrgId,
        organisation_id: tenant.organisationId,
      },
      select: {
        action: true,
        actor_user_id: true,
        clerk_org_id: true,
        created_at: true,
        id: true,
        organisation_id: true,
        payload: true,
      },
      orderBy: { created_at: "desc" },
      take: 5,
    });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          actorUserId: "user_123",
          category: "support",
          clerkOrgId: tenant.clerkOrgId,
          createdAt: new Date("2026-04-22T00:00:00.000Z"),
          id: "audit_123",
          issueNumber: 42,
          issueUrl: "https://github.com/hiltonbrown/leavesync/issues/42",
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
        action: "support_submissions.github_issue_created",
        actor_user_id: "user_123",
        clerk_org_id: tenant.clerkOrgId,
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

    const result = await listRecentSupportSubmissionAudits(
      tenant.clerkOrgId,
      tenant.organisationId
    );

    expect(result).toEqual({
      ok: true,
      value: [],
    });
  });
});
