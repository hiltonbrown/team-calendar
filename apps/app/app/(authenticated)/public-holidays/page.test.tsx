import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listForOrganisation: vi.fn(),
  locationFindMany: vi.fn(),
  organisationFindFirst: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, scopedOrganisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: scopedOrganisationId,
  })),
}));

vi.mock("@repo/availability", () => ({
  listForOrganisation: mocks.listForOrganisation,
}));
vi.mock("@repo/database", () => ({
  database: {
    location: { findMany: mocks.locationFindMany },
    organisation: { findFirst: mocks.organisationFindFirst },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@repo/auth/server", () => ({
  auth: vi.fn().mockResolvedValue({ orgRole: "org:admin" }),
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./public-holidays-list", () => ({
  PublicHolidaysList: ({
    filters,
  }: {
    filters: { includeSuppressed: boolean; locationId?: string; year: number };
  }) => (
    <div>
      Public holiday list {filters.year}{" "}
      {filters.includeSuppressed ? "including suppressed" : "active only"}
    </div>
  ),
}));

const Page = (await import("./page")).default;

const organisationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000010";
const PUBLIC_HOLIDAY_LIST_2026_PATTERN = /Public holiday list 2026/;
const INCLUDING_SUPPRESSED_PATTERN = /including suppressed/;

describe("PublicHolidaysPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
    });
    mocks.listForOrganisation.mockResolvedValue({ ok: true, value: [] });
    mocks.locationFindMany.mockResolvedValue([]);
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      region_code: null,
    });
  });

  it("requires viewer access and passes URL filters to the service", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          includeSuppressed: "true",
          locationId,
          org: organisationId,
          year: "2026",
        }),
      })
    );

    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:viewer");
    expect(mocks.listForOrganisation).toHaveBeenCalledWith(
      "org_1",
      organisationId,
      {
        includeSuppressed: true,
        locationId,
        year: 2026,
      }
    );
    expect(screen.getByText(PUBLIC_HOLIDAY_LIST_2026_PATTERN)).toBeDefined();
    expect(screen.getByText(INCLUDING_SUPPRESSED_PATTERN)).toBeDefined();
  });

  it("renders the shared fetch error state on loader failure", async () => {
    mocks.listForOrganisation.mockResolvedValue({
      error: { code: "internal", message: "Database unavailable" },
      ok: false,
    });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Unable to load public holidays")).toBeDefined();
  });
});
