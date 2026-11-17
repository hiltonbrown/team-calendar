import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOnboardingRecord: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  listOrganisationsByAccount: vi.fn(),
  loadWelcomeEligibility: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  isOnboardingAdmin: (role: string | null) =>
    role === "admin" || role === "owner",
  loadWelcomeEligibility: mocks.loadWelcomeEligibility,
}));
vi.mock("@repo/database/queries/onboarding", () => ({
  getOnboardingRecord: mocks.getOnboardingRecord,
}));
vi.mock("@repo/database/queries/organisations", () => ({
  listOrganisationsByAccount: mocks.listOrganisationsByAccount,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@repo/design-system/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: unknown }) => children,
  SidebarProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("./components/command-menu", () => ({ CommandMenu: () => null }));
vi.mock("./components/notifications-provider", () => ({
  NotificationsProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("./components/sidebar", () => ({
  GlobalSidebar: ({ children }: { children: unknown }) => children,
}));

const AppLayout = (await import("./layout")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";

function sessionFor(role: "owner" | "admin" | "manager" | "viewer" = "admin") {
  return { accountId: "org_1", role, sessionId: "session_1", userId: "user_1" };
}

function setPath(pathname: string) {
  mocks.headers.mockResolvedValue(
    new Headers(pathname ? { "x-pathname": pathname } : {})
  );
}

describe("AppLayout first-run gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      emailVerified: true,
      id: "user_1",
    });
    mocks.getSession.mockResolvedValue(sessionFor());
    mocks.listOrganisationsByAccount.mockResolvedValue({
      ok: true,
      value: [{ id: organisationId }],
    });
    setPath("/calendar");
  });

  it("rejects an absent session before any tenant lookup", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/sign-in"
    );
    expect(mocks.listOrganisationsByAccount).not.toHaveBeenCalled();
  });
  it("requires verified email before first-run lookup", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      emailVerified: false,
      id: "user_1",
    });
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/verify-email"
    );
    expect(mocks.listOrganisationsByAccount).not.toHaveBeenCalled();
  });
  it("requires an active Account before first-run lookup", async () => {
    mocks.getSession.mockResolvedValue({
      ...sessionFor(),
      accountId: null,
      role: null,
    });
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/select-account"
    );
    expect(mocks.listOrganisationsByAccount).not.toHaveBeenCalled();
  });
  it("sends an admin with an unfinished wizard to onboarding", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("admin"));
    mocks.getOnboardingRecord.mockResolvedValue({
      ok: true,
      value: { completedAt: null, step: "xero", xeroSkippedAt: null },
    });
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/onboarding"
    );
    expect(mocks.loadWelcomeEligibility).not.toHaveBeenCalled();
  });

  it("sends an admin to onboarding before the organisation row exists", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("owner"));
    mocks.listOrganisationsByAccount.mockResolvedValue({
      ok: true,
      value: [],
    });
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/onboarding"
    );
  });

  it("lets the wizard's Xero selection page render", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("admin"));
    mocks.getOnboardingRecord.mockResolvedValue({
      ok: true,
      value: { completedAt: null, step: "xero", xeroSkippedAt: null },
    });
    setPath("/settings/integrations/xero/connect");
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("does not lock admins out when the onboarding lookup fails", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("admin"));
    mocks.getOnboardingRecord.mockResolvedValue({
      error: { code: "internal", message: "down" },
      ok: false,
    });
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("sends an eligible member to the welcome", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("viewer"));
    mocks.loadWelcomeEligibility.mockResolvedValue({
      ok: true,
      value: { eligible: true, personId: "p1" },
    });
    await expect(AppLayout({ children: null })).rejects.toThrow(
      "redirect:/welcome"
    );
    expect(mocks.getOnboardingRecord).not.toHaveBeenCalled();
  });

  it("leaves an unlinked member on the requested page", async () => {
    mocks.getSession.mockResolvedValue(sessionFor("manager"));
    mocks.loadWelcomeEligibility.mockResolvedValue({
      ok: true,
      value: { eligible: false, personId: null },
    });
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
