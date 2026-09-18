import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacyLeaveBalancesPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const organisationId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000011";

describe("legacy leave-balance redirect", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
  });

  it.each([
    { expected: "/people", params: {} },
    {
      expected: `/people?org=${organisationId}`,
      params: { org: organisationId },
    },
    {
      expected: "/people?status=active",
      params: { org: "invalid", personId: "invalid", status: "active" },
    },
  ])("lands list input at $expected", async ({ expected, params }) => {
    await LegacyLeaveBalancesPage({ searchParams: Promise.resolve(params) });
    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });

  it("opens a scalar person link directly on Balances", async () => {
    await LegacyLeaveBalancesPage({
      searchParams: Promise.resolve({ org: organisationId, personId }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/people/${personId}?tab=balances&org=${organisationId}`
    );
  });

  it("selects the first valid repeated identifiers and preserves other repeats", async () => {
    await LegacyLeaveBalancesPage({
      searchParams: Promise.resolve({
        org: ["invalid", organisationId],
        personId: ["", "invalid", personId],
        source: ["xero", "manual"],
        tab: ["history", "upcoming"],
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/people/${personId}?source=xero&source=manual&tab=balances&org=${organisationId}`
    );
  });
});
