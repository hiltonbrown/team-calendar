import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupportGitHubIssue: vi.fn(),
  currentUser: vi.fn(),
  getOrganisationById: vi.fn(),
  logError: vi.fn(),
  persistSupportSubmissionAudit: vi.fn(),
  requireOrg: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
}));

vi.mock("@repo/database/src/queries/organisations", () => ({
  getOrganisationById: mocks.getOrganisationById,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    error: mocks.logError,
  },
}));

vi.mock("@/lib/github/create-support-issue-service", () => ({
  createSupportGitHubIssue: mocks.createSupportGitHubIssue,
}));

vi.mock("@/lib/support/persist-support-submission-audit", () => ({
  persistSupportSubmissionAudit: mocks.persistSupportSubmissionAudit,
}));

const { POST } = await import("./route");

describe("support GitHub issue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");

    mocks.requireOrg.mockResolvedValue("org_clerk_123");
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "alex@example.com" }],
      firstName: "Alex",
      fullName: "Alex Example",
      id: "user_123",
      lastName: "Example",
    });
    mocks.getOrganisationById.mockResolvedValue({
      ok: true,
      value: {
        clerkOrgId: "org_clerk_123",
        id: "00000000-0000-4000-8000-000000000001",
        name: "Team Calendar Dev Organisation",
      },
    });
    mocks.createSupportGitHubIssue.mockResolvedValue({
      ok: true,
      value: {
        issueNumber: 123,
        issueTitle: "[Support] Missing leave entry",
        issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
        labelAssignmentSucceeded: true,
        labelsAttempted: ["support", "priority:normal"],
      },
    });
    mocks.persistSupportSubmissionAudit.mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it("creates a GitHub issue with server-derived tenant and user context", async () => {
    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "The calendar is missing one leave entry.",
          page_url:
            "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001&tab=form",
          priority: "normal",
          subject: "Missing leave entry",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      issueNumber: 123,
      issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
    });

    expect(mocks.getOrganisationById).toHaveBeenCalledWith(
      "org_clerk_123",
      "00000000-0000-4000-8000-000000000001"
    );
    expect(mocks.createSupportGitHubIssue).toHaveBeenCalledWith({
      payload: {
        category: "support",
        message: "The calendar is missing one leave entry.",
        page_url:
          "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001&tab=form",
        priority: "normal",
        subject: "Missing leave entry",
      },
      clerk_org_id: "org_clerk_123",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      organisation_name: "Team Calendar Dev Organisation",
      current_route:
        "/support?org=00000000-0000-4000-8000-000000000001&tab=form",
      environment: "test",
      user_email: "alex@example.com",
      user_id: "user_123",
      user_name: "Alex Example",
    });
    expect(mocks.persistSupportSubmissionAudit).toHaveBeenCalledWith({
      category: "support",
      clerkOrgId: "org_clerk_123",
      issueNumber: 123,
      issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
      labelAssignmentSucceeded: true,
      labelsAttempted: ["support", "priority:normal"],
      organisationId: "00000000-0000-4000-8000-000000000001",
      status: "created",
      subject: "Missing leave entry",
      userId: "user_123",
    });
  });

  it("returns a validation error for invalid payloads", async () => {
    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url: "/support",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "validation_error",
      message: "Invalid URL",
    });
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
  });

  it("returns unauthorised when Clerk org auth is missing", async () => {
    mocks.requireOrg.mockRejectedValue(new Error("missing org"));

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url: "https://app.teamcalendar.test/support",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "unauthorised",
      message: "Not authenticated",
    });
  });

  it("returns unauthorised when the current user cannot be resolved", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url: "https://app.teamcalendar.test/support",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "unauthorised",
      message: "User not found",
    });
  });

  it("returns forbidden when the organisation query param is not a UUID", async () => {
    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url: "https://app.teamcalendar.test/support?org=not-a-uuid",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "forbidden",
      message: "Invalid organisation",
    });
    expect(mocks.getOrganisationById).not.toHaveBeenCalled();
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
  });

  it("returns forbidden when the organisation context is not valid for the Clerk org", async () => {
    mocks.getOrganisationById.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Organisation not found" },
    });

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url:
            "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "forbidden",
      message: "Invalid organisation",
    });
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
  });

  it("returns an integration error when organisation lookup fails internally", async () => {
    mocks.getOrganisationById.mockResolvedValue({
      ok: false,
      error: { code: "internal", message: "Failed to get organisation" },
    });

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "Need help",
          page_url:
            "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001",
          priority: "normal",
          subject: "Help",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "integration_error",
      message: "Failed to resolve organisation context.",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to resolve support organisation context",
      {
        clerkOrgId: "org_clerk_123",
        organisationId: "00000000-0000-4000-8000-000000000001",
      }
    );
  });

  it("maps integration service failures to a 500 response", async () => {
    mocks.createSupportGitHubIssue.mockResolvedValue({
      ok: false,
      error: {
        code: "integration_error",
        message: "GitHub issue creation failed.",
      },
    });

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "feedback",
          message: "This flow could be clearer.",
          page_url: "https://app.teamcalendar.test/support",
          priority: "high",
          subject: "Clarify save feedback",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "integration_error",
      message: "GitHub issue creation failed.",
    });
    expect(mocks.persistSupportSubmissionAudit).not.toHaveBeenCalled();
  });

  it("creates a GitHub issue without organisation context when the page URL has no org query param", async () => {
    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "feedback",
          message: "This flow could be clearer.",
          page_url: "https://app.teamcalendar.test/support",
          priority: "high",
          subject: "Clarify save feedback",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.getOrganisationById).not.toHaveBeenCalled();
    expect(mocks.createSupportGitHubIssue).toHaveBeenCalledWith({
      payload: {
        category: "feedback",
        message: "This flow could be clearer.",
        page_url: "https://app.teamcalendar.test/support",
        priority: "high",
        subject: "Clarify save feedback",
      },
      clerk_org_id: "org_clerk_123",
      organisation_id: undefined,
      organisation_name: undefined,
      current_route: "/support",
      environment: "test",
      user_email: "alex@example.com",
      user_id: "user_123",
      user_name: "Alex Example",
    });
    expect(mocks.persistSupportSubmissionAudit).not.toHaveBeenCalled();
  });

  it("returns success when audit persistence fails after the GitHub issue is created", async () => {
    mocks.persistSupportSubmissionAudit.mockResolvedValue({
      ok: false,
      error: {
        code: "internal",
        message: "Failed to persist the support audit event.",
      },
    });

    const response = await POST(
      new Request("http://api.test/api/support/github-issue", {
        body: JSON.stringify({
          category: "support",
          message: "The calendar is missing one leave entry.",
          page_url:
            "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001",
          priority: "normal",
          subject: "Missing leave entry",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      issueNumber: 123,
      issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to persist support submission audit event",
      {
        clerkOrgId: "org_clerk_123",
        issueNumber: 123,
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_123",
      }
    );
  });
});
