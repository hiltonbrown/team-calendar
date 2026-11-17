import { describe, expect, it } from "vitest";
import {
  buildSupportIssueMarkdownBody,
  buildSupportIssueTitle,
  getSupportIssueLabels,
  SupportSubmissionIssueInputSchema,
  SupportSubmissionPayloadSchema,
} from "./support-submission";

describe("SupportSubmissionPayloadSchema", () => {
  it("parses a minimal valid payload", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      message: "The calendar is missing one leave entry.",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Missing leave entry",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      category: "support",
      message: "The calendar is missing one leave entry.",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Missing leave entry",
    });
  });

  it("parses a payload with optional fields and context", () => {
    const parsed = SupportSubmissionIssueInputSchema.safeParse({
      account_id: "org_123",
      actual_outcome: "The page saves, but the data never appears.",
      app_version: "2026.04.22",
      category: "feedback",
      current_route: "/plans",
      email_override: "help@example.com",
      environment: "production",
      expected_outcome: "The updated plan should appear immediately.",
      message: "It would help to show a clearer success state after saving.",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      organisation_name: "Team Calendar Dev Organisation",
      page_url: "https://app.teamcalendar.test/plans",
      priority: "high",
      reproduction_steps: "1. Open Plans\n2. Save a change",
      subject: "Improve post-save feedback",
      user_email: "user@example.com",
      user_id: "user_123",
      user_name: "Alex Example",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      account_id: "org_123",
      actual_outcome: "The page saves, but the data never appears.",
      app_version: "2026.04.22",
      category: "feedback",
      current_route: "/plans",
      email_override: "help@example.com",
      environment: "production",
      expected_outcome: "The updated plan should appear immediately.",
      message: "It would help to show a clearer success state after saving.",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      organisation_name: "Team Calendar Dev Organisation",
      page_url: "https://app.teamcalendar.test/plans",
      priority: "high",
      reproduction_steps: "1. Open Plans\n2. Save a change",
      subject: "Improve post-save feedback",
      user_email: "user@example.com",
      user_id: "user_123",
      user_name: "Alex Example",
    });
  });

  it("normalises empty optional strings to undefined", () => {
    const parsed = SupportSubmissionIssueInputSchema.parse({
      account_id: " ",
      actual_outcome: " ",
      app_version: " ",
      category: "support",
      current_route: " ",
      email_override: " ",
      environment: " ",
      expected_outcome: " ",
      message: "Need assistance",
      organisation_id: " ",
      organisation_name: " ",
      page_url: "https://app.teamcalendar.test/support",
      priority: "low",
      reproduction_steps: " ",
      subject: "Help",
      user_email: " ",
      user_id: " ",
      user_name: " ",
    });

    expect(parsed).toEqual({
      category: "support",
      message: "Need assistance",
      page_url: "https://app.teamcalendar.test/support",
      priority: "low",
      subject: "Help",
    });
  });

  it("rejects an invalid category", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "bug",
      message: "Need assistance",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Help",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid priority", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      message: "Need assistance",
      page_url: "https://app.teamcalendar.test/support",
      priority: "urgent",
      subject: "Help",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a blank subject", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      message: "Need assistance",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "   ",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a blank message", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      message: "   ",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Help",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid page URL", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      message: "Need assistance",
      page_url: "/support",
      priority: "normal",
      subject: "Help",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid email override", () => {
    const parsed = SupportSubmissionPayloadSchema.safeParse({
      category: "support",
      email_override: "not-an-email",
      message: "Need assistance",
      page_url: "https://app.teamcalendar.test/support",
      priority: "normal",
      subject: "Help",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("buildSupportIssueTitle", () => {
  it("builds a support issue title", () => {
    expect(
      buildSupportIssueTitle({
        category: "support",
        subject: "Missing leave entry",
      })
    ).toBe("[Support] Missing leave entry");
  });

  it("builds a feedback issue title", () => {
    expect(
      buildSupportIssueTitle({
        category: "feedback",
        subject: "Improve post-save feedback",
      })
    ).toBe("[Feedback] Improve post-save feedback");
  });

  it("normalises control characters and whitespace in title", () => {
    expect(
      buildSupportIssueTitle({
        category: "support",
        subject: "Line 1\r\nLine 2\t\x00Done",
      })
    ).toBe("[Support] Line 1 Line 2 Done");
  });
});

describe("buildSupportIssueMarkdownBody", () => {
  it("builds a deterministic markdown body with safe fences and untrusted markers", () => {
    const body = buildSupportIssueMarkdownBody(
      SupportSubmissionIssueInputSchema.parse({
        account_id: "org_123",
        actual_outcome: "The saved plan does not refresh.",
        app_version: "2026.04.22",
        category: "support",
        current_route: "/plans",
        email_override: "help@example.com",
        environment: "production",
        expected_outcome: "The updated plan should appear immediately.",
        message: "A saved plan is not visible until a hard refresh.",
        organisation_id: "00000000-0000-4000-8000-000000000001",
        organisation_name: "Team Calendar Dev Organisation",
        page_url: "https://app.teamcalendar.test/plans",
        priority: "high",
        reproduction_steps: "1. Open Plans\n2. Edit a plan\n3. Save changes",
        subject: "Saved plan does not refresh",
        user_email: "user@example.com",
        user_id: "user_123",
        user_name: "Alex Example",
      })
    );

    expect(body).toBe(`## Metadata
- Category: Support
- Priority: High
- Account ID: org_123
- Organisation ID: 00000000-0000-4000-8000-000000000001
- User ID: user_123
- Current route: /plans
- Page URL: https://app.teamcalendar.test/plans
- Environment: production
- App version: 2026.04.22

## Untrusted user content

### Subject (untrusted)
\`\`\`untrusted-user-text
Saved plan does not refresh
\`\`\`

### Message (untrusted)
\`\`\`untrusted-user-text
A saved plan is not visible until a hard refresh.
\`\`\`

### Reproduction steps (untrusted)
\`\`\`untrusted-user-text
1. Open Plans
2. Edit a plan
3. Save changes
\`\`\`

### Expected outcome (untrusted)
\`\`\`untrusted-user-text
The updated plan should appear immediately.
\`\`\`

### Actual outcome (untrusted)
\`\`\`untrusted-user-text
The saved plan does not refresh.
\`\`\`

## Internal notes
Submitted from Team Calendar support form.

Complete triage notes here.`);
  });

  it("omits empty optional sections while keeping required sections and excludes direct PII", () => {
    const body = buildSupportIssueMarkdownBody(
      SupportSubmissionIssueInputSchema.parse({
        category: "feedback",
        email_override: "override@example.com",
        message: "The navigation could be clearer for new users.",
        organisation_name: "Acme Org",
        page_url: "https://app.teamcalendar.test/dashboard",
        priority: "normal",
        subject: "Clarify navigation labels",
        user_email: "alex@example.com",
        user_name: "Alex",
      })
    );

    expect(body).toContain("## Metadata");
    expect(body).toContain("## Untrusted user content");
    expect(body).toContain("### Subject (untrusted)");
    expect(body).toContain("### Message (untrusted)");
    expect(body).toContain("## Internal notes");
    expect(body).not.toContain("### Reproduction steps");
    expect(body).not.toContain("### Expected outcome");
    expect(body).not.toContain("### Actual outcome");
    expect(body).toContain("- Category: Feedback");
    expect(body).toContain("- Priority: Normal");
    expect(body).toContain(
      "- Page URL: https://app.teamcalendar.test/dashboard"
    );

    // Direct PII excluded
    expect(body).not.toContain("override@example.com");
    expect(body).not.toContain("alex@example.com");
    expect(body).not.toContain("Alex");
    expect(body).not.toContain("Acme Org");
  });
});

describe("getSupportIssueLabels", () => {
  it("maps support with normal priority", () => {
    expect(
      getSupportIssueLabels({
        category: "support",
        priority: "normal",
      })
    ).toEqual(["support", "priority:normal"]);
  });

  it("maps feedback with high priority", () => {
    expect(
      getSupportIssueLabels({
        category: "feedback",
        priority: "high",
      })
    ).toEqual(["feedback", "priority:high"]);
  });
});
