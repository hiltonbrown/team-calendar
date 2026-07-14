import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type NotificationSseRecipientDatabase,
  pollNotificationStream,
  publishNotificationEvent,
  publishOrganisationNotificationEvent,
} from "./broker";
import {
  type NotificationSseStreamClient,
  setNotificationSseStreamClientForTests,
} from "./redis-stream";

const event = {
  type: "notification.all_read" as const,
  payload: { unreadCount: 0 as const },
};

describe("notification SSE broker", () => {
  let streamClient: NotificationSseStreamClient;
  let recipients: NotificationSseRecipientDatabase;

  beforeEach(() => {
    const entries = new Map<string, { event: typeof event; id: string }[]>();
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
  });

  afterEach(() => {
    setNotificationSseStreamClientForTests(null);
  });

  it("reads a published event from the matching user channel", async () => {
    await publishNotificationEvent(
      { organisationId: "org-a", userId: "user-a" },
      event
    );

    await expect(
      pollNotificationStream(
        { organisationId: "org-a", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([{ event, id: "1000-1" }]);
  });

  it("does not read an event across organisations for the same user", async () => {
    await publishNotificationEvent(
      { organisationId: "org-a", userId: "user-a" },
      event
    );

    await expect(
      pollNotificationStream(
        { organisationId: "org-b", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([]);
  });

  it("fans organisation events out only to active members of that organisation", async () => {
    const findMany = vi.mocked(recipients.person.findMany);
    findMany.mockResolvedValue([
      { clerk_user_id: "user-a" },
      { clerk_user_id: "user-b" },
      // Prisma's generic mock requires its full inferred result type here.
    ] as never);

    await publishOrganisationNotificationEvent(
      { clerkOrgId: "clerk-org-a", organisationId: "org-a" },
      event,
      recipients
    );

    expect(findMany).toHaveBeenCalledWith({
      select: { clerk_user_id: true },
      where: {
        archived_at: null,
        clerk_org_id: "clerk-org-a",
        clerk_user_id: { not: null },
        is_active: true,
        organisation_id: "org-a",
      },
    });
    expect(streamClient.append).toHaveBeenCalledTimes(2);
    expect(streamClient.append).toHaveBeenCalledWith("sse:user-a:org-a", event);
    expect(streamClient.append).toHaveBeenCalledWith("sse:user-b:org-a", event);
    expect(streamClient.append).not.toHaveBeenCalledWith(
      "sse:user-a:org-b",
      event
    );
  });

  it("degrades gracefully when the stream client is unconfigured", async () => {
    setNotificationSseStreamClientForTests(null);

    await expect(
      publishNotificationEvent(
        { organisationId: "org-a", userId: "user-a" },
        event
      )
    ).resolves.toBeUndefined();
    await expect(
      pollNotificationStream(
        { organisationId: "org-a", userId: "user-a" },
        "0-0"
      )
    ).resolves.toEqual([]);
  });
});
