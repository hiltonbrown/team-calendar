import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacyEditAvailabilityPage from "./[recordId]/edit/page";
import LegacyNewAvailabilityPage from "./new/page";
import LegacyAvailabilityPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const organisationId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000021";

describe("legacy availability redirects", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
  });

  it.each([
    { expected: "/plans", params: {} },
    {
      expected: `/plans?org=${organisationId}`,
      params: { org: organisationId },
    },
    {
      expected: `/plans?org=${organisationId}`,
      params: { org: ["not-an-id", organisationId] },
    },
    { expected: "/plans", params: { org: "not-an-id" } },
  ])("normalises list org input to $expected", async ({ expected, params }) => {
    await LegacyAvailabilityPage({ searchParams: Promise.resolve(params) });
    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });

  it("preserves repeated non-org values in their original order", async () => {
    await LegacyAvailabilityPage({
      searchParams: Promise.resolve({
        org: organisationId,
        status: ["draft", "approved"],
        tab: "team",
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/plans?status=draft&status=approved&tab=team&org=${organisationId}`
    );
  });

  it("preserves person, date and intent values for new-plan deep links", async () => {
    await LegacyNewAvailabilityPage({
      searchParams: Promise.resolve({
        date: "2026-09-10",
        intent: ["leave", "availability"],
        org: organisationId,
        personId: "person-123",
        startsAt: "2026-09-10T09:00:00+10:00",
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/plans/new?date=2026-09-10&intent=leave&intent=availability&personId=person-123&startsAt=2026-09-10T09%3A00%3A00%2B10%3A00&org=${organisationId}`
    );
  });

  it("preserves the record and query values for edit deep links", async () => {
    await LegacyEditAvailabilityPage({
      params: Promise.resolve({ recordId }),
      searchParams: Promise.resolve({
        date: "2026-09-12",
        org: ["", organisationId],
        personId: "person-456",
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/plans/${recordId}/edit?date=2026-09-12&personId=person-456&org=${organisationId}`
    );
  });

  it("keeps the superseded manual form deleted", () => {
    expect(
      existsSync(new URL("./manual-availability-form.tsx", import.meta.url))
    ).toBe(false);
  });
});
