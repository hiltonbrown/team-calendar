import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeedDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  detail: vi.fn(),
  feedDetail: vi.fn(),
  preview: vi.fn(),
}));
const organisationId = "00000000-0000-4000-8000-000000000001";
const feedId = "00000000-0000-4000-8000-000000000101";
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: async () => ({ id: "user_1" }),
}));
vi.mock("@repo/feeds", () => ({
  getFeedDetail: mocks.detail,
  normaliseRole: (role: string) => role.replace("org:", ""),
  previewFeed: mocks.preview,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: async () => ({
    clerkOrgId: "org_1",
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
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    mocks.detail.mockResolvedValue({
      ok: true,
      value: { id: feedId, isOwnedByActor: false, privacyMode: "named" },
    });
  });
  afterEach(cleanup);

  it.each(["org:viewer", "org:manager"])(
    "passes preview errors separately to the presentation for %s",
    async (orgRole) => {
      mocks.auth.mockResolvedValue({ orgRole });
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
      expect(mocks.preview).toHaveBeenCalledWith({
        actingRole: orgRole.replace("org:", ""),
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        feedId,
        horizonDays: 30,
        organisationId,
        privacyMode: "named",
      });
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
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
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
