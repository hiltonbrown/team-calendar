import { cleanup, render, screen } from "@testing-library/react";
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  computeWorkingDays: vi.fn(),
  currentUser: vi.fn(),
  ensureCurrentUserPerson: vi.fn(),
  hasActiveXeroConnection: vi.fn(),
  listMyRecords: vi.fn(),
  listTeamRecords: vi.fn(),
  redirect: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  computeWorkingDays: mocks.computeWorkingDays,
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
  listMyRecords: mocks.listMyRecords,
  listTeamRecords: mocks.listTeamRecords,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
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
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "person@example.com" }],
      firstName: "Test",
      id: "user_1",
      imageUrl: "https://img.clerk.com/user.png",
      lastName: "Person",
    });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      orgQueryValue: null,
    });
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    mocks.listMyRecords.mockResolvedValue({ ok: true, value: [] });
    mocks.listTeamRecords.mockResolvedValue({ ok: true, value: [] });
    mocks.hasActiveXeroConnection.mockResolvedValue(false);
  });

  afterEach(() => cleanup());

  it("repairs the current user person before listing my records", async () => {
    render(await PlansPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      },
      {
        avatarUrl: "https://img.clerk.com/user.png",
        clerkUserId: "user_1",
        displayName: "Test Person",
        email: "person@example.com",
        firstName: "Test",
        lastName: "Person",
      }
    );
    expect(mocks.listMyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      })
    );
  });

  it("does not render the generic fetch error when person linking conflicts", async () => {
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      error: {
        code: "conflict",
        message: "Multiple people match this Clerk user's email.",
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

  it("computes working days once per returned record without amplification", async () => {
    const records = Array.from({ length: 25 }, (_, index) => ({
      allDay: true,
      approvalNote: null,
      approvalStatus: "draft",
      approvedAt: null,
      archivedAt: null,
      balanceChip: null,
      clerkOrgId: "org_1",
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
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });

    render(await PlansPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.computeWorkingDays).toHaveBeenCalledTimes(records.length);
    expect(screen.getByText("Plans client: 25")).toBeDefined();
  });
});
