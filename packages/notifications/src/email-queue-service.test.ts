import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock(
  "@repo/database",
  async () =>
    await vi.importActual<typeof import("@repo/database/tenant-db")>(
      "@repo/database/tenant-db"
    )
);
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>) =>
      mocks.poolTransaction(run),
  },
}));
vi.mock("@repo/email", () => ({ sendNotificationEmail: mocks.send }));

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  poolTransaction: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
}));

const client = {
  notificationEmailQueue: {
    create: mocks.create,
    findMany: mocks.findMany,
    update: mocks.update,
  },
};

const {
  enqueueNotificationEmail,
  preferencesUrl,
  sendQueuedNotificationEmails,
} = await import("./email-queue-service");

const queuedEmail = (overrides: Record<string, unknown> = {}) => ({
  action_url: "https://app.teamcalendar.test/notifications",
  attempts: 0,
  body: "Approved.",
  id: "00000000-0000-4000-8000-000000000201",
  recipient_email: "ava@example.com",
  title: "Leave approved",
  unsubscribe_url:
    "https://app.teamcalendar.test/notifications?tab=preferences",
  ...overrides,
});

describe("email-queue-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolTransaction.mockImplementation(
      async (run: (db: unknown) => Promise<unknown>) =>
        run({ ...client, $queryRaw: vi.fn(async () => []) })
    );

    vi.stubEnv("RESEND_FROM", "notifications@teamcalendar.test");
    vi.stubEnv("RESEND_TOKEN", "re_test_token");
    mocks.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.send.mockResolvedValue({
      ok: true,
      value: { id: "email_1" },
    });
    mocks.update.mockResolvedValue({});
  });

  it.each([
    ["RESEND_TOKEN", ""],
    ["RESEND_TOKEN", "invalid-token"],
    ["RESEND_FROM", ""],
    ["RESEND_FROM", "not-an-email"],
  ])(
    "returns a configuration failure without querying the queue when %s is invalid",
    async (name, value) => {
      vi.stubEnv(name, value);

      const result = await sendQueuedNotificationEmails("org_1");

      expect(result).toEqual({
        error: {
          code: "configuration_error",
          message: "Notification email transport is not configured.",
        },
        ok: false,
      });
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it("processes the preserved backlog after transport configuration is restored", async () => {
    mocks.findMany.mockResolvedValue([
      queuedEmail(),
      queuedEmail({ id: "00000000-0000-4000-8000-000000000202" }),
    ]);
    vi.stubEnv("RESEND_TOKEN", "");

    const unavailable = await sendQueuedNotificationEmails("org_1");

    expect(unavailable.ok).toBe(false);
    expect(mocks.findMany).not.toHaveBeenCalled();

    vi.stubEnv("RESEND_TOKEN", "re_restored_token");
    const recovered = await sendQueuedNotificationEmails("org_1");

    expect(recovered).toEqual({
      ok: true,
      value: { failed: 0, processed: 2, sent: 2 },
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("creates a durable queue row with preference URL", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        actionUrl: "/plans?recordId=00000000-0000-4000-8000-000000000099",
        body: "Approved.",
        emailTemplate: "LeaveApproved",
        notificationId: "00000000-0000-4000-8000-000000000101",
        notificationType: "leave_approved",
        organisationId: "00000000-0000-4000-8000-000000000001",
        recipientEmail: "ava@example.com",
        recipientUserId: "user_1",
        title: "Leave approved",
      }),
      (db) =>
        enqueueNotificationEmail(
          {
            accountId: "org_1",
            actionUrl: "/plans?recordId=00000000-0000-4000-8000-000000000099",
            body: "Approved.",
            emailTemplate: "LeaveApproved",
            notificationId: "00000000-0000-4000-8000-000000000101",
            notificationType: "leave_approved",
            organisationId: "00000000-0000-4000-8000-000000000001",
            recipientEmail: "ava@example.com",
            recipientUserId: "user_1",
            title: "Leave approved",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email_template: "LeaveApproved",
          notification_type: "leave_approved",
          unsubscribe_url: expect.stringContaining("focus=leave_approved"),
        }),
      })
    );
  });

  it("builds a non-mutating preferences URL", () => {
    expect(
      preferencesUrl("leave_submitted", "00000000-0000-4000-8000-000000000001")
    ).toContain("/notifications?tab=preferences&focus=leave_submitted");
  });

  it("links unsubscribe preferences to the notification's company", () => {
    const url = new URL(preferencesUrl("leave_submitted", "company-B"));
    expect(url.searchParams.get("org")).toBe("company-B");
    expect(url.searchParams.get("tab")).toBe("preferences");
  });

  it("drains only the account-bound queue by default", async () => {
    const result = await sendQueuedNotificationEmails("org_1");
    expect(result).toEqual({
      ok: true,
      value: { failed: 0, processed: 0, sent: 0 },
    });
    expect(mocks.poolTransaction).toHaveBeenCalledOnce();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account_id: "org_1", status: "queued" },
      })
    );
  });

  it("marks a successfully sent row as sent", async () => {
    mocks.findMany.mockResolvedValue([queuedEmail()]);

    const result = await sendQueuedNotificationEmails("org_1");

    expect(result).toEqual({
      ok: true,
      value: { failed: 0, processed: 1, sent: 1 },
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "00000000-0000-4000-8000-000000000201",
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: { increment: 1 },
          sent_at: expect.any(Date),
          status: "sent",
        }),
      })
    );
  });

  it("keeps a failed send below the threshold queued with its error", async () => {
    mocks.findMany.mockResolvedValue([queuedEmail({ attempts: 3 })]);
    mocks.send.mockResolvedValue({ error: "Provider unavailable", ok: false });

    await sendQueuedNotificationEmails("org_1");

    expect(mocks.update).toHaveBeenCalledWith({
      data: {
        attempts: { increment: 1 },
        last_error: "Provider unavailable",
        status: "queued",
      },
      where: {
        account_id: "org_1",
        id: "00000000-0000-4000-8000-000000000201",
      },
    });
  });

  it("marks a fifth failed send as failed", async () => {
    mocks.findMany.mockResolvedValue([queuedEmail({ attempts: 4 })]);
    mocks.send.mockResolvedValue({ error: "Provider unavailable", ok: false });

    await sendQueuedNotificationEmails("org_1");

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  it("continues sending when another row fails", async () => {
    mocks.findMany.mockResolvedValue([
      queuedEmail(),
      queuedEmail({ id: "00000000-0000-4000-8000-000000000202" }),
    ]);
    mocks.send
      .mockResolvedValueOnce({ error: "Provider unavailable", ok: false })
      .mockResolvedValueOnce({ ok: true, value: { id: "email_2" } });

    const result = await sendQueuedNotificationEmails("org_1");

    expect(result).toEqual({
      ok: true,
      value: { failed: 1, processed: 2, sent: 1 },
    });
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
