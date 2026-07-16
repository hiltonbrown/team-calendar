import { describe, expect, it } from "vitest";
import { exportAnalyticsToCsv } from "./analytics-csv";
import type { AnalyticsRecordListItem } from "./leave-reports-service";

describe("exportAnalyticsToCsv", () => {
  const mockRecord = (
    overrides?: Partial<AnalyticsRecordListItem>
  ): AnalyticsRecordListItem => ({
    id: "record-1",
    personId: "person-1",
    personFirstName: "John",
    personLastName: "Doe",
    teamName: "Engineering",
    locationName: "Sydney",
    recordType: "annual_leave",
    sourceType: "xero",
    startsAt: new Date("2026-05-10T09:00:00Z"),
    endsAt: new Date("2026-05-12T17:00:00Z"),
    workingDays: 3,
    submittedAt: new Date("2026-05-01T09:00:00Z"),
    approvedAt: new Date("2026-05-02T10:00:00Z"),
    approvedByFirstName: "Jane",
    approvedByLastName: "Smith",
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
      "John,Doe,Engineering,Sydney,Annual Leave,xero,2026-05-10T09:00:00.000Z,2026-05-12T17:00:00.000Z,3,2026-05-01T09:00:00.000Z,2026-05-02T10:00:00.000Z,Jane Smith"
    );
    expect(lines[2]).toBe(""); // ends with trailing newline
  });

  it("escapes fields containing commas, quotes, and newlines correctly", () => {
    const record = mockRecord({
      personFirstName: 'John "CEO"',
      teamName: "Sales, Marketing & PR",
      locationName: "New\nYork",
    });
    const csv = exportAnalyticsToCsv([record]);
    // New York contains newline, which will span lines, but let's parse or verify string includes quotes
    expect(csv).toContain('"John ""CEO"""');
    expect(csv).toContain('"Sales, Marketing & PR"');
    expect(csv).toContain('"New\nYork"');
  });

  it("handles null values and missing approvers correctly", () => {
    const record = mockRecord({
      teamName: null,
      locationName: null,
      submittedAt: null,
      approvedAt: null,
      approvedByFirstName: null,
      approvedByLastName: null,
    });
    const csv = exportAnalyticsToCsv([record]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      "John,Doe,,,Annual Leave,xero,2026-05-10T09:00:00.000Z,2026-05-12T17:00:00.000Z,3,,,"
    );
  });
});
