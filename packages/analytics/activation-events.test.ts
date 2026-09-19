import { describe, expect, it } from "vitest";
import {
  activationEventNames,
  activationEventPropertyAllowlist,
  createActivationEvent,
} from "./activation-events";

describe("activation event catalogue", () => {
  it("defines the complete version-one activation funnel", () => {
    expect(activationEventNames).toEqual([
      "Application Accepted",
      "Customer Admitted",
      "Organisation Provisioned",
      "Xero Connected",
      "Initial Sync Completed",
      "First Feed Accessed",
      "First Leave Submitted",
      "First Leave Approved",
    ]);
    expect(activationEventPropertyAllowlist).toEqual([
      "event_id",
      "event_version",
    ]);
  });

  it("creates stable pseudonymous identities for provider retries", () => {
    const input = {
      deduplicationKey: "delivery_123",
      name: "Application Accepted" as const,
      occurredAt: "2026-09-19T00:00:00.000Z",
      subjectId: "reference_123",
    };
    const first = createActivationEvent(input);
    const replay = createActivationEvent(input);
    expect(replay).toEqual(first);
    expect(first.distinctId).not.toContain("reference_123");
    expect(Object.keys(first.properties)).toEqual([
      "event_id",
      "event_version",
    ]);
  });
});
