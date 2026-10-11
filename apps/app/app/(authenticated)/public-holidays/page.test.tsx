import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  locationFindMany: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
  resolvePublicHolidays: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, scopedOrganisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: scopedOrganisationId,
  })),
}));

vi.mock("@repo/availability", () => ({
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));
vi.mock("@repo/database", () => ({
  scopedQuery: mocks.scopedQuery,
  tenantDatabase: vi.fn(() => ({
    location: { findMany: mocks.locationFindMany },
  })),
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@repo/auth/server", () => ({ auth: mocks.auth }));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./public-holidays-list", () => ({
  PublicHolidaysList: ({
    canManage,
    filters,
    groups,
  }: {
    canManage: boolean;
    filters: { includeHidden: boolean; year: number };
    groups: Array<{ holidays: Array<{ name: string }>; name: string }>;
  }) => (
    <div>
      <p>
        Public holiday list {filters.year}{" "}
        {filters.includeHidden ? "including hidden" : "active only"}
      </p>
      <p>{canManage ? "can manage" : "read only"}</p>
      {groups.map((group) => (
        <p key={group.name}>
          {group.name}: {group.holidays.map((row) => row.name).join(", ")}
        </p>
      ))}
    </div>
  ),
}));

const Page = (await import("./page")).default;

const organisationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000010";

function holiday(overrides: Record<string, unknown>) {
  return {
    area: null,
    classification: "non_working",
    date: "2026-12-25",
    hidden: false,
    key: "au-national-2026-12-25-christmas-day",
    kind: "public",
    locationId: null,
    name: "Christmas Day",
    origin: "official",
    startsAt: null,
    ...overrides,
  };
}

describe("PublicHolidaysPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
    });
    mocks.resolvePublicHolidays.mockResolvedValue({ ok: true, value: [] });
    mocks.locationFindMany.mockResolvedValue([
      { id: locationId, name: "Brisbane" },
    ]);
  });

  it("requires viewer access and resolves the selected year with hidden rows", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          includeHidden: "true",
          org: organisationId,
          year: "2026",
        }),
      })
    );

    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:viewer");
    expect(mocks.resolvePublicHolidays).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      from: "2026-01-01",
      includeHidden: true,
      organisationId,
      to: "2026-12-31",
    });
    expect(mocks.locationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerk_org_id: "org_1", organisation_id: organisationId },
      })
    );
    expect(
      screen.getByText("Public holiday list 2026 including hidden")
    ).toBeDefined();
    expect(screen.getByText("can manage")).toBeDefined();
  });

  it("groups holidays by location and leaves hidden rows out by default", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [
        holiday({ locationId }),
        holiday({ hidden: true, locationId, name: "Boxing Day" }),
        holiday({ locationId: null, name: "Founders Day", origin: "custom" }),
      ],
    });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Brisbane: Christmas Day")).toBeDefined();
    expect(
      screen.getByText("People without a location: Founders Day")
    ).toBeDefined();
  });

  it("shows the list read-only to viewers", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("read only")).toBeDefined();
  });

  it("renders the shared fetch error state on loader failure", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      error: { code: "internal", message: "Database unavailable" },
      ok: false,
    });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Unable to load public holidays")).toBeDefined();
  });
});
