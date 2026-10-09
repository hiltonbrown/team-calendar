import { describe, expect, it } from "vitest";
import { exportAnalyticsToCsv } from "./analytics-csv";
import type { AnalyticsRecordListItem } from "./leave-reports-service";

describe("exportAnalyticsToCsv", () => {
  const mockRecord = (
    overrides?: Partial<AnalyticsRecordListItem>
  ): AnalyticsRecordListItem => ({
    approvedAt: new Date("2026-05-02T10:00:00Z"),
    approvedByFirstName: "Jane",
    approvedByLastName: "Smith",
    endsAt: new Date("2026-05-12T17:00:00Z"),
    id: "record-1",
    locationName: "Sydney",
    personFirstName: "John",
    personId: "person-1",
    personLastName: "Doe",
    recordType: "annual_leave",
    sourceType: "xero",
    startsAt: new Date("2026-05-10T09:00:00Z"),
    submittedAt: new Date("2026-05-01T09:00:00Z"),
    teamName: "Engineering",
    workingDays: 3,
    ...overrides,
  });

  const expectedHeaders =
    "First Name,Last Name,Team,Location,Record Type,Source,Starts At,Ends At,Working Days,Submitted At,Approved At,Approved By";

  it("yields header-only output for an empty dataset", () => {
    const csv = exportAnalyticsToCsv([]);
    expect(csv).toBe(`${expectedHeaders}\r\n`);
  });

  it("exports records with correct stable columns, ISO dates, and formatted values", () => {
    const record = mockRecord();
    const csv = exportAnalyticsToCsv([record]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(expectedHeaders);
    expect(lines[1]).toBe(
      "John,Doe,Engineering,Sydney,Annual leave,xero,2026-05-10T09:00:00.000Z,2026-05-12T17:00:00.000Z,3,2026-05-01T09:00:00.000Z,2026-05-02T10:00:00.000Z,Jane Smith"
    );
    expect(lines[2]).toBe(""); // ends with trailing newline
  });

  it("escapes fields containing commas, quotes, and newlines correctly", () => {
    const record = mockRecord({
      locationName: "New\nYork",
      personFirstName: 'John "CEO"',
      teamName: "Sales, Marketing & PR",
    });
    const csv = exportAnalyticsToCsv([record]);
    // New York contains newline, which will span lines, but let's parse or verify string includes quotes
    expect(csv).toContain('"John ""CEO"""');
    expect(csv).toContain('"Sales, Marketing & PR"');
    expect(csv).toContain('"New\nYork"');
  });

  it("handles null values and missing approvers correctly", () => {
    const record = mockRecord({
      approvedAt: null,
      approvedByFirstName: null,
      approvedByLastName: null,
      locationName: null,
      submittedAt: null,
      teamName: null,
    });
    const csv = exportAnalyticsToCsv([record]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      "John,Doe,,,Annual leave,xero,2026-05-10T09:00:00.000Z,2026-05-12T17:00:00.000Z,3,,,"
    );
  });
});
