import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SyncHealthCard } from "./sync-health-card";

describe("SyncHealthCard connection recovery", () => {
  afterEach(cleanup);
  it.each([
    [
      "unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ] as const)(
    "preserves %s without reporting disconnection",
    (state, message) => {
      render(
        <SyncHealthCard
          orgQueryValue={null}
          state={{
            data: {
              activeTenantCount: 0,
              ctaUrl: "/sync",
              failedRunsLast24h: 0,
              lastSuccessfulSync: null,
              pendingFailedRecords: 0,
              runsLast24h: 0,
              tenantCount: 1,
              xeroConnectionState: state,
            },
            status: "ready",
          }}
        />
      );
      expect(screen.getByText(message)).toBeDefined();
      expect(screen.getByText("Xero sync unavailable")).toBeDefined();
      expect(screen.queryByText("Xero not connected")).toBeNull();
    }
  );
});
