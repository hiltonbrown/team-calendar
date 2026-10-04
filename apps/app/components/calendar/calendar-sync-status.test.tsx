import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarSyncStatus } from "./calendar-sync-status";

const LEAVE_SYNCED_REGEX = /Leave synced/;
const NOT_LINKED_REGEX = /Your account is not linked/;
const NOT_LINKED_FULL_REGEX =
  /Your account is not linked to a person in this organisation/;
const STALE_NOTICE_REGEX = /Sync delayed: leave may be stale/;
const SYNC_ERROR_REGEX = /Sync issue: Rate limit exceeded/;

describe("CalendarSyncStatus", () => {
  afterEach(() => cleanup());

  it("renders business name and healthy leave synced state", () => {
    render(
      <CalendarSyncStatus
        businessName="Acme Payroll AU"
        isPersonalUnlinked={false}
        isStale={false}
        isSyncPaused={false}
        lastLeaveRefresh={new Date()}
        orgQueryValue={null}
        syncError={null}
      />
    );

    expect(screen.getByText("Acme Payroll AU")).toBeDefined();
    expect(screen.getByText(LEAVE_SYNCED_REGEX)).toBeDefined();
    expect(screen.queryByText(NOT_LINKED_REGEX)).toBeNull();
  });

  it("renders stale notice when leave records are stale", () => {
    render(
      <CalendarSyncStatus
        businessName="Acme Payroll AU"
        isPersonalUnlinked={false}
        isStale={true}
        isSyncPaused={false}
        lastLeaveRefresh={new Date(Date.now() - 3_600_000)}
        orgQueryValue={null}
        syncError={null}
      />
    );

    expect(screen.getByText(STALE_NOTICE_REGEX)).toBeDefined();
  });

  it("renders sync error when sync error is present", () => {
    render(
      <CalendarSyncStatus
        businessName="Acme Payroll AU"
        isPersonalUnlinked={false}
        isStale={false}
        isSyncPaused={false}
        lastLeaveRefresh={null}
        orgQueryValue={null}
        syncError="Rate limit exceeded"
      />
    );

    expect(screen.getByText(SYNC_ERROR_REGEX)).toBeDefined();
  });

  it("renders personal unlinked notice when isPersonalUnlinked is true", () => {
    render(
      <CalendarSyncStatus
        businessName="Acme Payroll AU"
        isPersonalUnlinked={true}
        isStale={false}
        isSyncPaused={false}
        lastLeaveRefresh={new Date()}
        orgQueryValue="test-org"
        syncError={null}
      />
    );

    expect(screen.getByText(NOT_LINKED_FULL_REGEX)).toBeDefined();
    expect(screen.getByRole("link", { name: "Review people" })).toBeDefined();
  });
});
