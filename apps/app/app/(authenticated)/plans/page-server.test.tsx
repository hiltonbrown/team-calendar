const tenantPoolMocks = vi.hoisted(() => ({
  organisationFindFirst: vi.fn((query: { where: { id?: string } }) =>
    Promise.resolve(
      query.where.id === "00000000-0000-4000-8000-000000000001"
        ? {
            country_code: "AU",
            id: "00000000-0000-4000-8000-000000000001",
            name: "Company A",
            timezone: "Australia/Brisbane",
          }
        : null
    )
  ),
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (client: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
        organisation: {
          findFirst: tenantPoolMocks.organisationFindFirst,
          findMany: vi.fn(() =>
            Promise.resolve([
              {
                country_code: "AU",
                id: "00000000-0000-4000-8000-000000000001",
                name: "Company A",
                timezone: "Australia/Brisbane",
              },
            ])
          ),
        },
        person: {
          findFirst: vi.fn(() =>
            Promise.resolve({
              id: "person-1",
              organisation_id: "00000000-0000-4000-8000-000000000001",
            })
          ),
        },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/account-companies")
  >("../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/organisations")
  >("../../../../../packages/database/src/queries/organisations")),
}));

import { cleanup, render, screen } from "@testing-library/react";
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  computeWorkingDays: vi.fn(),
  ensureCurrentUserPerson: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  listMyRecords: vi.fn(),
  listTeamRecords: vi.fn(),
  redirect: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePagePermission: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  computeWorkingDaysFromReferenceData: mocks.computeWorkingDays,
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
  listMyRecordsPage: async (...args: unknown[]) => {
    const result = await mocks.listMyRecords(...args);
    return result.ok
      ? {
          ok: true,
          value: {
            items: result.value,
            nextCursor: null,
            totalCount: result.value.length,
            window: { from: null, to: null },
          },
        }
      : result;
  },
  listTeamRecordsPage: async (...args: unknown[]) => {
    const result = await mocks.listTeamRecords(...args);
    return result.ok
      ? {
          ok: true,
          value: {
            items: result.value,
            nextCursor: null,
            totalCount: result.value.length,
            window: { from: null, to: null },
          },
        }
      : result;
  },
  loadWorkingDaysReferenceData: vi.fn(() => Promise.resolve({})),
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/lib/auth/require-page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@repo/design-system/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
}));
vi.mock("@/components/states/empty-state", () => ({
  EmptyState: ({
    actionSlot,
    description,
    title,
  }: {
    actionSlot?: ReactNode;
    description: string;
    title?: string;
  }) =>
    createElement(
      "div",
      null,
      title ? createElement("h2", null, title) : null,
      createElement("p", null, description),
      actionSlot
    ),
}));
vi.mock("@/components/states/fetch-error-state", () => ({
  FetchErrorState: ({ entityName }: { entityName: string }) =>
    createElement("p", null, `Unable to load ${entityName}`),
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => createElement("header", null, page),
}));
vi.mock("./plans-client", () => ({
  PlansClient: ({ records }: { records: unknown[] }) =>
    createElement("section", null, `Plans client: ${records.length}`),
}));
const { default: PlansPage } = await import("./page");
describe("Plans page server data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "viewer" });
    mocks.getCurrentUser.mockResolvedValue({
      email: "person@example.com",
      id: "user_1",
      image: "https://images.example.test/user.png",
      name: "Test Person",
    });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      accountId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      orgQueryValue: null,
    });
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    mocks.listMyRecords.mockResolvedValue({ ok: true, value: [] });
    mocks.listTeamRecords.mockResolvedValue({ ok: true, value: [] });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
  });
  afterEach(() => cleanup());
  it("offers Connect Xero only for a verified disconnected admin", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    render(await PlansPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("link", { name: "Connect Xero to submit leave" })
    ).toBeDefined();
    expect(
      screen.getByText("Xero is not connected.", { exact: false })
    ).toBeDefined();
  });
  it("shows cannot-check recovery without a reconnect prompt for an unavailable admin", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    render(await PlansPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.queryByRole("link", { name: "Connect Xero to submit leave" })
    ).toBeNull();
    expect(
      screen.getByText(
        "We cannot reach Xero right now. Try again later or contact support."
      )
    ).toBeDefined();
  });
  it("repairs the current user person before listing my records", async () => {
    render(await PlansPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      },
      {
        avatarUrl: "https://images.example.test/user.png",
        displayName: "Test Person",
        email: "person@example.com",
        userId: "user_1",
      },
      expect.any(Object)
    );
    expect(mocks.listMyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      }),
      expect.any(Object)
    );
  });
  it("does not render the generic fetch error when person linking conflicts", async () => {
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      error: {
        code: "conflict",
        message: "Multiple people match this user's email.",
      },
      ok: false,
    });
    render(await PlansPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Person profile needs review")).toBeDefined();
    expect(screen.queryByText("Unable to load plans")).toBeNull();
    expect(mocks.listMyRecords).not.toHaveBeenCalled();
  });
  it("keeps existing linked users scoped to their own records", async () => {
    render(await PlansPage({ searchParams: Promise.resolve({ tab: "my" }) }));
    expect(mocks.listMyRecords).toHaveBeenCalledTimes(1);
    expect(mocks.listTeamRecords).not.toHaveBeenCalled();
    expect(screen.getByText("Plans client: 0")).toBeDefined();
  });
  it("passes the imported recovery filter through the scoped administrator Plans route", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    render(
      await PlansPage({
        searchParams: Promise.resolve({
          allHistory: "true",
          sourceType: "xero_leave",
          tab: "team",
        }),
      })
    );
    expect(mocks.listTeamRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "org_1",
        actingRole: "admin",
        allHistory: true,
        filters: expect.objectContaining({ sourceType: ["xero_leave"] }),
        organisationId: "00000000-0000-4000-8000-000000000001",
      }),
      expect.any(Object)
    );
    expect(mocks.listMyRecords).not.toHaveBeenCalled();
  });
  it("computes working days once per returned record without amplification", async () => {
    const records = Array.from({ length: 25 }, (_, index) => ({
      accountId: "org_1",
      allDay: true,
      approvalNote: null,
      approvalStatus: "draft",
      approvedAt: null,
      archivedAt: null,
      balanceChip: null,
      contactabilityStatus: "unavailable",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: "user_1",
      derivedSequence: 0,
      derivedUidKey: `record-${index}`,
      editableActions: ["edit"],
      endsAt: new Date("2026-05-05T23:59:59.999Z"),
      failedAction: null,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      notesInternal: null,
      organisationId: "00000000-0000-4000-8000-000000000001",
      person: {
        email: "person@example.com",
        firstName: "Test",
        id: "00000000-0000-4000-8000-000000000011",
        lastName: "Person",
        locationId: null,
        managerPersonId: null,
      },
      personId: "00000000-0000-4000-8000-000000000011",
      privacyMode: "named",
      recordType: "annual_leave",
      sourceRemoteId: null,
      sourceType: "team_calendar_leave",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
      submittedAt: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      xeroWriteError: null,
    }));
    mocks.listMyRecords.mockResolvedValue({ ok: true, value: records });
    mocks.computeWorkingDays.mockReturnValue({ ok: true, value: 2 });
    render(await PlansPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.computeWorkingDays).toHaveBeenCalledTimes(records.length);
    expect(screen.getByText("Plans client: 25")).toBeDefined();
  });
});
