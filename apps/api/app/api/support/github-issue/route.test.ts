import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkSupportRateLimit: vi.fn(),
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

vi.mock("@repo/database/queries/organisations", () => ({
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

vi.mock("@/lib/rate-limit/support-rate-limit", () => ({
  checkSupportRateLimit: mocks.checkSupportRateLimit,
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
    mocks.checkSupportRateLimit.mockResolvedValue({ allowed: true });
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
      issueNumber: 123,
      issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
      ok: true,
    });

    expect(mocks.getOrganisationById).toHaveBeenCalledWith(
      "org_clerk_123",
      "00000000-0000-4000-8000-000000000001"
    );
    expect(mocks.createSupportGitHubIssue).toHaveBeenCalledWith({
      clerk_org_id: "org_clerk_123",
      current_route:
        "/support?org=00000000-0000-4000-8000-000000000001&tab=form",
      environment: "test",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      payload: {
        category: "support",
        message: "The calendar is missing one leave entry.",
        page_url:
          "https://app.teamcalendar.test/support?org=00000000-0000-4000-8000-000000000001&tab=form",
        priority: "normal",
        subject: "Missing leave entry",
      },
      user_id: "user_123",
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
      code: "validation_error",
      message: "Invalid URL",
      ok: false,
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
      code: "unauthorised",
      message: "Not authenticated",
      ok: false,
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
      code: "unauthorised",
      message: "User not found",
      ok: false,
    });
    expect(mocks.checkSupportRateLimit).not.toHaveBeenCalled();
  });

  it("returns Retry-After without calling downstream services when the rate limit is exceeded", async () => {
    mocks.checkSupportRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 321,
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

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("321");
    await expect(response.json()).resolves.toEqual({
      code: "rate_limit",
      message: "Too many support requests. Try again later.",
      ok: false,
    });
    expect(mocks.checkSupportRateLimit).toHaveBeenCalledWith({
      clerkOrgId: "org_clerk_123",
      userId: "user_123",
    });
    expect(mocks.getOrganisationById).not.toHaveBeenCalled();
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
    expect(mocks.persistSupportSubmissionAudit).not.toHaveBeenCalled();
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
      code: "forbidden",
      message: "Invalid organisation",
      ok: false,
    });
    expect(mocks.getOrganisationById).not.toHaveBeenCalled();
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
  });

  it("returns forbidden when the organisation context is not valid for the Clerk org", async () => {
    mocks.getOrganisationById.mockResolvedValue({
      error: { code: "not_found", message: "Organisation not found" },
      ok: false,
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
      code: "forbidden",
      message: "Invalid organisation",
      ok: false,
    });
    expect(mocks.createSupportGitHubIssue).not.toHaveBeenCalled();
  });

  it("returns an integration error when organisation lookup fails internally", async () => {
    mocks.getOrganisationById.mockResolvedValue({
      error: { code: "internal", message: "Failed to get organisation" },
      ok: false,
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
      code: "integration_error",
      message: "Failed to resolve organisation context.",
      ok: false,
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
      error: {
        code: "integration_error",
        message: "GitHub issue creation failed.",
      },
      ok: false,
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
      code: "integration_error",
      message: "GitHub issue creation failed.",
      ok: false,
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
      clerk_org_id: "org_clerk_123",
      current_route: "/support",
      environment: "test",
      organisation_id: undefined,
      payload: {
        category: "feedback",
        message: "This flow could be clearer.",
        page_url: "https://app.teamcalendar.test/support",
        priority: "high",
        subject: "Clarify save feedback",
      },
      user_id: "user_123",
    });
    expect(mocks.persistSupportSubmissionAudit).not.toHaveBeenCalled();
  });

  it("returns success when audit persistence fails after the GitHub issue is created", async () => {
    mocks.persistSupportSubmissionAudit.mockResolvedValue({
      error: {
        code: "internal",
        message: "Failed to persist the support audit event.",
      },
      ok: false,
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
      issueNumber: 123,
      issueUrl: "https://github.com/hiltonbrown/team-calendar/issues/123",
      ok: true,
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
