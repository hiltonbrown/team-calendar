vi.mock("@repo/database", () => ({ withTenantDb: mocks.withTenantDb }));
const mocks = vi.hoisted(() => ({ withTenantDb: vi.fn() }));

import type { Database } from "@repo/database";

interface NotificationSseRecipientDatabase {
  person: Pick<Database["person"], "findMany">;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type NotificationSseEvent,
  pollNotificationStream,
  publishNotificationEvent,
  publishOrganisationNotificationEvent,
} from "./broker";
import {
  type NotificationSseStreamClient,
  setNotificationSseStreamClientForTests,
} from "./redis-stream";

const event = {
  payload: { unreadCount: 0 as const },
  type: "notification.all_read" as const,
};

describe("notification SSE broker", () => {
  let streamClient: NotificationSseStreamClient;
  let recipients: NotificationSseRecipientDatabase;

  beforeEach(() => {
    const entries = new Map<
      string,
      { event: NotificationSseEvent; id: string }[]
    >();
    let sequence = 0;
    streamClient = {
      append: vi.fn((channel, nextEvent) => {
        sequence += 1;
        const channelEntries = entries.get(channel) ?? [];
        channelEntries.push({
          event: nextEvent,
          id: `1000-${sequence}`,
        });
        entries.set(channel, channelEntries);
        return Promise.resolve();
      }),
      readSince: vi.fn((channel, lastId) =>
        Promise.resolve(
          (entries.get(channel) ?? []).filter((entry) => entry.id > lastId)
        )
      ),
    };
    recipients = {
      person: {
        findMany: vi.fn(),
      },
    };
    setNotificationSseStreamClientForTests(streamClient);
    mocks.withTenantDb.mockImplementation(
      async (
        _account: string,
        run: (db: NotificationSseRecipientDatabase) => Promise<unknown>
      ) => run(recipients)
    );
  });

  afterEach(() => {
    setNotificationSseStreamClientForTests(null);
  });

  it("reads a published event from the matching user channel", async () => {
    await publishNotificationEvent(
      { clerkOrgId: "clerk-org-a", userId: "user-a" },
      event
    );

    await expect(
      pollNotificationStream(
        { clerkOrgId: "clerk-org-a", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([{ event, id: "1000-1" }]);
  });

  it("does not read an event across accounts for the same user", async () => {
    await publishNotificationEvent(
      { clerkOrgId: "clerk-org-a", userId: "user-a" },
      event
    );

    await expect(
      pollNotificationStream(
        { clerkOrgId: "clerk-org-b", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([]);
  });

  it("resolves default recipients through the account-bound client", async () => {
    vi.mocked(recipients.person.findMany).mockResolvedValue([
      { clerk_user_id: "user-a" },
    ] as never);
    await publishOrganisationNotificationEvent(
      { clerkOrgId: "clerk-org-a", organisationId: "org-a" },
      event
    );
    expect(mocks.withTenantDb).toHaveBeenCalledWith(
      "clerk-org-a",
      expect.any(Function)
    );
    expect(streamClient.append).toHaveBeenCalledWith(
      "sse:account:clerk-org-a:user-a",
      event
    );
  });

  it("fans organisation events out only to active members across the account", async () => {
    const findMany = vi.mocked(recipients.person.findMany);
    findMany.mockResolvedValue([
      { clerk_user_id: "user-a" },
      { clerk_user_id: "user-b" },
      // Prisma's generic mock requires its full inferred result type here.
    ] as never);

    await publishOrganisationNotificationEvent(
      { clerkOrgId: "clerk-org-a", organisationId: "org-a" },
      event
    );

    expect(findMany).toHaveBeenCalledWith({
      select: { clerk_user_id: true },
      where: {
        archived_at: null,
        clerk_org_id: "clerk-org-a",
        clerk_user_id: { not: null },
        is_active: true,
        organisation: { clerk_org_id: "clerk-org-a" },
      },
    });
    expect(streamClient.append).toHaveBeenCalledTimes(2);
    expect(streamClient.append).toHaveBeenCalledWith(
      "sse:account:clerk-org-a:user-a",
      event
    );
    expect(streamClient.append).toHaveBeenCalledWith(
      "sse:account:clerk-org-a:user-b",
      event
    );
    expect(streamClient.append).not.toHaveBeenCalledWith(
      "sse:account:clerk-org-b:user-a",
      event
    );
  });

  it("delivers a B-company event to an A-employed manager through one account channel", async () => {
    const created = {
      payload: {
        actionUrl: "/plans/record-B",
        body: "Company B request",
        category: "approval_flow" as const,
        createdAt: new Date().toISOString(),
        notificationId: "notification-B",
        organisationId: "company-B",
        organisationName: "Company B",
        title: "Leave submitted",
        type: "leave_submitted" as const,
        unreadCount: 2,
      },
      type: "notification.created" as const,
    };
    await publishNotificationEvent(
      { clerkOrgId: "account-A", userId: "manager-A" },
      created
    );
    expect(streamClient.append).toHaveBeenCalledWith(
      "sse:account:account-A:manager-A",
      created
    );
    expect(
      await pollNotificationStream(
        { clerkOrgId: "account-A", userId: "manager-A" },
        "0-0"
      )
    ).toMatchObject([{ event: created }]);
    expect(
      await pollNotificationStream(
        { clerkOrgId: "account-B", userId: "manager-A" },
        "0-0"
      )
    ).toEqual([]);
  });
  it("deduplicates a user when broadcasting a company sync event across the account", async () => {
    vi.mocked(recipients.person.findMany).mockResolvedValue([
      { clerk_user_id: "manager-A" },
      { clerk_user_id: "manager-A" },
    ] as never);
    await publishOrganisationNotificationEvent(
      { clerkOrgId: "account-A", organisationId: "company-B" },
      event
    );
    expect(streamClient.append).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully when the stream client is unconfigured", async () => {
    setNotificationSseStreamClientForTests(null);

    await expect(
      publishNotificationEvent(
        { clerkOrgId: "clerk-org-a", userId: "user-a" },
        event
      )
    ).resolves.toBeUndefined();
    await expect(
      pollNotificationStream(
        { clerkOrgId: "clerk-org-a", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([]);
  });
});
