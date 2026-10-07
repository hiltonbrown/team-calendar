import { describe, expect, it } from "vitest";
import { createSlice14Fixture } from "./slice-14-fixture";

describe("createSlice14Fixture", () => {
  it("provides the Slice 14 regression baseline", () => {
    const fixture = createSlice14Fixture();

    expect(fixture.organisations).toHaveLength(2);
    expect(fixture.xeroConnections).toHaveLength(3);
    expect(fixture.people).toHaveLength(30);
    expect(fixture.teams).toHaveLength(6);
    expect(fixture.locations).toHaveLength(4);
    expect(fixture.availabilityRecords).toHaveLength(200);
    expect(fixture.feeds).toHaveLength(10);
    expect(fixture.publicHolidayImports).toHaveLength(2);
    expect(
      fixture.syncRuns
        .map((run) => run.status)
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(["failed", "partial_success", "succeeded"]);
    expect(fixture.notifications.map((row) => row.type)).toContain(
      "sync_reconciliation_complete"
    );
    expect(fixture.auditEvents.map((event) => event.action)).toContain(
      "organisation_settings.updated"
    );
  });

  it("keeps tenant data partitioned by organisation", () => {
    const fixture = createSlice14Fixture();
    const orgIds = new Set(fixture.organisations.map((org) => org.id));

    expect(
      fixture.people.every((person) => orgIds.has(person.organisationId))
    ).toBe(true);
    expect(
      fixture.availabilityRecords.every((record) =>
        orgIds.has(record.organisationId)
      )
    ).toBe(true);
    expect(fixture.feeds.every((feed) => orgIds.has(feed.organisationId))).toBe(
      true
    );
  });
});
