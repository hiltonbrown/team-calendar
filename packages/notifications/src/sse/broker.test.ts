import { describe, expect, it, vi } from "vitest";
import {
  listenerCount,
  publishNotificationEvent,
  publishOrganisationNotificationEvent,
  subscribeToNotificationStream,
} from "./broker";

describe("notification SSE broker", () => {
  it("delivers events only to the exact user and organisation key", () => {
    const matching = vi.fn();
    const otherOrg = vi.fn();
    const otherUser = vi.fn();

    const unsubscribeMatching = subscribeToNotificationStream(
      { organisationId: "org-a", userId: "user-a" },
      matching
    );
    const unsubscribeOtherOrg = subscribeToNotificationStream(
      { organisationId: "org-b", userId: "user-a" },
      otherOrg
    );
    const unsubscribeOtherUser = subscribeToNotificationStream(
      { organisationId: "org-a", userId: "user-b" },
      otherUser
    );

    publishNotificationEvent(
      { organisationId: "org-a", userId: "user-a" },
      {
        type: "notification.all_read",
        payload: { unreadCount: 0 },
      }
    );

    expect(matching).toHaveBeenCalledTimes(1);
    expect(otherOrg).not.toHaveBeenCalled();
    expect(otherUser).not.toHaveBeenCalled();

    unsubscribeMatching();
    unsubscribeOtherOrg();
    unsubscribeOtherUser();
  });

  it("broadcasts organisation events only to listeners in the target organisation", () => {
    const orgAUserA = vi.fn();
    const orgAUserB = vi.fn();
    const orgBUserA = vi.fn();

    const unsubscribeOrgAUserA = subscribeToNotificationStream(
      { organisationId: "org-a", userId: "user-a" },
      orgAUserA
    );
    const unsubscribeOrgAUserB = subscribeToNotificationStream(
      { organisationId: "org-a", userId: "user-b" },
      orgAUserB
    );
    const unsubscribeOrgBUserA = subscribeToNotificationStream(
      { organisationId: "org-b", userId: "user-a" },
      orgBUserA
    );

    expect(listenerCount({ organisationId: "org-a", userId: "user-a" })).toBe(
      1
    );
    expect(listenerCount({ organisationId: "org-a", userId: "user-b" })).toBe(
      1
    );
    expect(listenerCount({ organisationId: "org-b", userId: "user-a" })).toBe(
      1
    );

    publishOrganisationNotificationEvent(
      { organisationId: "org-a" },
      {
        type: "sync.run_status_changed",
        payload: {
          organisationId: "org-a",
          runId: "run_1",
          runType: "sync-xero-leave-records",
          status: "completed",
          xeroTenantId: null,
        },
      }
    );

    expect(orgAUserA).toHaveBeenCalledTimes(1);
    expect(orgAUserB).toHaveBeenCalledTimes(1);
    expect(orgBUserA).not.toHaveBeenCalled();

    unsubscribeOrgAUserA();
    unsubscribeOrgAUserB();
    unsubscribeOrgBUserA();

    expect(listenerCount({ organisationId: "org-a", userId: "user-a" })).toBe(
      0
    );
    expect(listenerCount({ organisationId: "org-a", userId: "user-b" })).toBe(
      0
    );
    expect(listenerCount({ organisationId: "org-b", userId: "user-a" })).toBe(
      0
    );
  });

  it("does not broadcast to a non-UUID organisation with an overlapping suffix", () => {
    const targetOrg = vi.fn();
    const suffixNeighbour = vi.fn();

    const unsubscribeTargetOrg = subscribeToNotificationStream(
      { organisationId: "org", userId: "user-a" },
      targetOrg
    );
    const unsubscribeSuffixNeighbour = subscribeToNotificationStream(
      { organisationId: "not-org", userId: "user-b" },
      suffixNeighbour
    );

    publishOrganisationNotificationEvent(
      { organisationId: "org" },
      {
        type: "notification.all_read",
        payload: { unreadCount: 0 },
      }
    );

    expect(targetOrg).toHaveBeenCalledTimes(1);
    expect(suffixNeighbour).not.toHaveBeenCalled();

    unsubscribeTargetOrg();
    unsubscribeSuffixNeighbour();
  });
});
