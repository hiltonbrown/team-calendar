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
    typeof import("../../../../../../../packages/database/src/queries/account-companies")
  >("../../../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  ...(await vi.importActual<
    typeof import("../../../../../../../packages/database/src/queries/organisations")
  >("../../../../../../../packages/database/src/queries/organisations")),
}));
vi.mock("@repo/auth/helpers", () => ({
  requireAccount: () => Promise.resolve("org_1"),
}));

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeedDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  feedDetail: vi.fn(),
  getSession: vi.fn(),
  preview: vi.fn(),
}));
const organisationId = "00000000-0000-4000-8000-000000000001";
const feedId = "00000000-0000-4000-8000-000000000101";
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: async () => ({ id: "user_1" }),
  getSession: mocks.getSession,
}));
vi.mock("@repo/feeds", () => ({
  getFeedDetail: mocks.detail,
  normaliseRole: (role: string) => role,
  previewFeed: mocks.preview,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  resolveActiveOrgPageContext: async () => ({
    accountId: "org_1",
    organisationId: "00000000-0000-4000-8000-000000000001",
  }),
}));
vi.mock("@/components/feed/feed-detail", () => ({
  FeedDetail: (props: unknown) => {
    mocks.feedDetail(props);
    return null;
  },
}));
vi.mock("@/components/modals/intercepting-modal-shell", () => ({
  InterceptingModalShell: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const pageInput = () => ({
  params: Promise.resolve({ feedId }),
  searchParams: Promise.resolve({ org: organisationId }),
});
describe("Feed detail modal preview loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "viewer" });
    mocks.detail.mockResolvedValue({
      ok: true,
      value: { id: feedId, isOwnedByActor: false, privacyMode: "named" },
    });
  });
  afterEach(cleanup);

  it.each(["viewer", "manager"])(
    "passes preview errors separately to the presentation for %s",
    async (role) => {
      mocks.getSession.mockResolvedValue({ accountId: "org_1", role });
      mocks.preview.mockResolvedValue({
        error: {
          code: "unknown_error",
          message: "Preview data could not be loaded",
        },
        ok: false,
      });
      render(await FeedDetailPage(pageInput()));
      expect(mocks.feedDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          canManage: false,
          organisationId,
          previewErrors: { named: "Preview data could not be loaded" },
          previews: { named: [] },
        })
      );
      expect(mocks.preview).toHaveBeenCalledWith(
        {
          accountId: "org_1",
          actingRole: role,
          actingUserId: "user_1",
          feedId,
          horizonDays: 30,
          organisationId,
          privacyMode: "named",
        },
        expect.any(Object)
      );
    }
  );

  it("preserves successful empty preview data without an error", async () => {
    mocks.preview.mockResolvedValue({ ok: true, value: [] });
    render(await FeedDetailPage(pageInput()));
    expect(mocks.feedDetail).toHaveBeenCalledWith(
      expect.objectContaining({ previewErrors: {}, previews: { named: [] } })
    );
  });

  it("retains per-mode failure information alongside successful administrator previews", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    mocks.preview.mockImplementation(async ({ privacyMode }) =>
      privacyMode === "masked"
        ? { error: { message: "Masked preview unavailable" }, ok: false }
        : { ok: true, value: [] }
    );
    render(await FeedDetailPage(pageInput()));
    expect(mocks.feedDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        canManage: true,
        previewErrors: { masked: "Masked preview unavailable" },
        previews: { masked: [], named: [], private: [] },
      })
    );
  });

  it("lets the owner of a personal feed manage it and preview every mode", async () => {
    mocks.detail.mockResolvedValue({
      ok: true,
      value: { id: feedId, isOwnedByActor: true, privacyMode: "named" },
    });
    mocks.preview.mockResolvedValue({ ok: true, value: [] });
    render(await FeedDetailPage(pageInput()));
    expect(mocks.feedDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        canManage: true,
        isAdmin: false,
        previews: { masked: [], named: [], private: [] },
      })
    );
  });
});
