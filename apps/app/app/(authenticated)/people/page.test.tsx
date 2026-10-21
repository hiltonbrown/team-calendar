import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connection: vi.fn(),
  listPeople: vi.fn(),
  resolveAccountCompanies: vi.fn(),
  state: vi.fn(),
}));
vi.mock("@repo/auth/helpers", () => ({
  requireOrg: async () => "org_1",
}));
vi.mock("@repo/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@repo/availability", async () => ({
  getXeroConnectionStateForScope: mocks.state,
  listPeople: mocks.listPeople,
  selectCalendarCompanies: (
    await vi.importActual<
      typeof import("../../../../../packages/availability/src/calendar/calendar-service")
    >("../../../../../packages/availability/src/calendar/calendar-service")
  ).selectCalendarCompanies,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        location: { findMany: vi.fn(async () => []) },
        person: { findFirst: vi.fn(async () => null) },
        team: { findMany: vi.fn(async () => []) },
        xeroConnection: { findFirst: mocks.connection },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  resolveAccountCompanies: mocks.resolveAccountCompanies,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./people-client", () => ({
  PeopleClient: (props: {
    connectionId: string | null;
    totalCount: number;
  }) => (
    <div>
      {props.totalCount} people, connection: {props.connectionId ?? "none"}
    </div>
  ),
}));

const Page = (await import("./page")).default;
const companyId = "00000000-0000-4000-8000-000000000001";
const otherCompanyId = "00000000-0000-4000-8000-000000000002";

async function renderPage(params: Record<string, string> = {}) {
  render(await Page({ searchParams: Promise.resolve(params) }));
}

describe("PeoplePage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:owner", userId: "user_1" });
    mocks.resolveAccountCompanies.mockResolvedValue([
      { id: companyId, name: "Acme", timezone: "Australia/Brisbane" },
    ]);
    mocks.listPeople.mockResolvedValue({
      ok: true,
      value: { nextCursor: null, people: [], totalCount: 0 },
    });
    mocks.connection.mockResolvedValue({ id: "connection-1" });
    mocks.state.mockResolvedValue({ ok: true, value: { state: "connected" } });
  });

  it("loads the directory using supported tenant and company connection filters", async () => {
    await renderPage();
    expect(mocks.connection).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        clerk_org_id: "org_1",
        organisation_id: companyId,
        released_at: null,
      },
    });
    expect(screen.getByText("0 people, connection: connection-1")).toBeTruthy();
  });

  it("loads the directory without a Xero connection", async () => {
    mocks.connection.mockResolvedValue(null);
    mocks.state.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    await renderPage();
    expect(screen.getByText("0 people, connection: none")).toBeTruthy();
  });

  it("does not choose a single connection for an account-wide directory", async () => {
    mocks.resolveAccountCompanies.mockResolvedValue([
      { id: companyId, name: "Acme", timezone: "Australia/Brisbane" },
      { id: otherCompanyId, name: "Other", timezone: "Australia/Brisbane" },
    ]);
    await renderPage();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(screen.getByText("0 people, connection: none")).toBeTruthy();
  });

  it("rejects a company outside the account before querying its connection", async () => {
    await expect(renderPage({ org: otherCompanyId })).rejects.toThrow(
      "notFound"
    );
    expect(mocks.connection).not.toHaveBeenCalled();
  });
});
