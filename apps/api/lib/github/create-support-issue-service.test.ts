import {
  buildSupportIssueMarkdownBody,
  buildSupportIssueTitle,
  getSupportIssueLabels,
  type SupportSubmissionPayload,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  keys: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("./keys", () => ({
  keys: mocks.keys,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    error: mocks.logError,
    warn: mocks.logWarn,
  },
}));

const { createSupportGitHubIssue } = await import(
  "./create-support-issue-service"
);

describe("createSupportGitHubIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keys.mockReturnValue({
      GITHUB_OWNER: "team-calendar",
      GITHUB_REPO: "app",
      GITHUB_TOKEN: "secret-token",
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("creates an issue successfully and applies labels", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html_url: "https://github.com/team-calendar/app/issues/42",
            number: 42,
            title: "[Support] Missing leave entry",
          }),
          {
            status: 201,
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: "support" }]), {
          status: 200,
        })
      );

    const payload: SupportSubmissionPayload = {
      category: "support",
      message: "The calendar is missing one leave entry.",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Missing leave entry",
    };

    const result = await createSupportGitHubIssue({
      clerk_org_id: "org_123",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      organisation_name: "Team Calendar Dev Organisation",
      payload,
      user_email: "person@example.com",
      user_id: "user_123",
      user_name: "Alex Example",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        issueNumber: 42,
        issueTitle: "[Support] Missing leave entry",
        issueUrl: "https://github.com/team-calendar/app/issues/42",
        labelAssignmentSucceeded: true,
        labelsAttempted: ["support", "priority:normal"],
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/team-calendar/app/issues",
      {
        body: JSON.stringify({
          body: buildSupportIssueMarkdownBody({
            ...payload,
            clerk_org_id: "org_123",
            organisation_id: "00000000-0000-4000-8000-000000000001",
            organisation_name: "Team Calendar Dev Organisation",
            user_email: "person@example.com",
            user_id: "user_123",
            user_name: "Alex Example",
          }),
          title: buildSupportIssueTitle(payload),
        }),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "POST",
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/team-calendar/app/issues/42/labels",
      {
        body: JSON.stringify({
          labels: [...getSupportIssueLabels(payload)],
        }),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "POST",
      }
    );
  });

  it("maps create issue auth failures", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("forbidden", { status: 403 })
    );

    const result = await createSupportGitHubIssue({
      payload: {
        category: "support",
        message: "Need assistance",
        page_url: "https://app.teamcalendar.test/support",
        priority: "normal",
        subject: "Help",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "auth_error",
        message: "GitHub authentication failed.",
      },
    });
  });

  it("maps create issue integration failures without exposing raw bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("sensitive upstream details", { status: 422 })
    );

    const result = await createSupportGitHubIssue({
      payload: {
        category: "feedback",
        message: "This flow could be clearer.",
        page_url: "https://app.teamcalendar.test/support",
        priority: "high",
        subject: "Clarify save feedback",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "integration_error",
        message: "GitHub issue creation failed.",
      },
    });
    expect(result.ok && result.value).not.toContain(
      "sensitive upstream details"
    );
  });

  it("falls back when label assignment fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html_url: "https://github.com/team-calendar/app/issues/9",
            number: 9,
            title: "[Feedback] Clarify save feedback",
          }),
          {
            status: 201,
          }
        )
      )
      .mockResolvedValueOnce(new Response("missing labels", { status: 404 }));

    const result = await createSupportGitHubIssue({
      payload: {
        category: "feedback",
        message: "This flow could be clearer.",
        page_url: "https://app.teamcalendar.test/support",
        priority: "high",
        subject: "Clarify save feedback",
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        issueNumber: 9,
        issueTitle: "[Feedback] Clarify save feedback",
        issueUrl: "https://github.com/team-calendar/app/issues/9",
        labelAssignmentSucceeded: false,
        labelsAttempted: ["feedback", "priority:high"],
      },
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "GitHub label assignment failed",
      {
        issueNumber: 9,
        labels: ["feedback", "priority:high"],
        owner: "team-calendar",
        repo: "app",
        status: 404,
      }
    );
  });

  it("returns a configuration error when GitHub config is missing", async () => {
    mocks.keys.mockReturnValue({
      GITHUB_OWNER: "team-calendar",
      GITHUB_REPO: undefined,
      GITHUB_TOKEN: "secret-token",
    });

    const result = await createSupportGitHubIssue({
      payload: {
        category: "support",
        message: "Need assistance",
        page_url: "https://app.teamcalendar.test/support",
        priority: "normal",
        subject: "Help",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "configuration_error",
        message: "GitHub issue integration is not configured.",
      },
    });
  });

  it("returns a validation error for invalid payloads", async () => {
    const result = await createSupportGitHubIssue({
      payload: {
        category: "support",
        message: "Need assistance",
        page_url: "/support",
        priority: "normal",
        subject: "Help",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid URL",
      },
    });
  });

  it("does not leak the configured token into logs or responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html_url: "https://github.com/team-calendar/app/issues/7",
            number: 7,
            title: "[Support] Missing leave entry",
          }),
          {
            status: 201,
          }
        )
      )
      .mockRejectedValueOnce(new Error("label request failed"));

    const result = await createSupportGitHubIssue({
      payload: {
        category: "support",
        message: "The calendar is missing one leave entry.",
        page_url: "https://app.teamcalendar.test/support",
        priority: "normal",
        subject: "Missing leave entry",
      },
    });

    expect(result.ok).toBe(true);

    const loggedValues = JSON.stringify(mocks.logWarn.mock.calls);
    expect(loggedValues).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("returns an integration error when issue creation throws unexpectedly", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network failure"));

    const result = await createSupportGitHubIssue({
      payload: {
        category: "support",
        message: "Need assistance",
        page_url: "https://app.teamcalendar.test/support",
        priority: "normal",
        subject: "Help",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "integration_error",
        message: "Failed to create the GitHub issue.",
      },
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Unexpected GitHub issue creation failure",
      {
        error: expect.any(Error),
        owner: "team-calendar",
        repo: "app",
      }
    );
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(
      "secret-token"
    );
  });
});
