import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedDetail } from "./feed-detail";

const mocks = vi.hoisted(() => ({
  archiveFeedAction: vi.fn(),
  pauseFeedAction: vi.fn(),
  refresh: vi.fn(),
  restoreFeedAction: vi.fn(),
  resumeFeedAction: vi.fn(),
  rotateTokenAction: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/(authenticated)/feeds/_actions", () => ({
  archiveFeedAction: (input: unknown) => mocks.archiveFeedAction(input),
  pauseFeedAction: (input: unknown) => mocks.pauseFeedAction(input),
  restoreFeedAction: (input: unknown) => mocks.restoreFeedAction(input),
  resumeFeedAction: (input: unknown) => mocks.resumeFeedAction(input),
  rotateTokenAction: (input: unknown) => mocks.rotateTokenAction(input),
}));

const currentUrl = "https://calendar.example/ical/tc1.current.signature.ics";
const ACTIVE_FEED_NEEDED_PATTERN =
  /An active feed is needed before you can add/;
const SHOW_URL_PATTERN = /show url/i;
const detail = {
  activeTokenHint: {
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    hint: "abcd",
    lastUsedAt: null,
  },
  description: "Approved availability",
  id: "00000000-0000-4000-8000-000000000101",
  includesPublicHolidays: true,
  name: "All staff",
  privacyMode: "named" as const,
  scopeSummary: "All people",
  scopes: [{ id: "scope-1", label: "All people", scopeType: "org" }],
  status: "active" as const,
  subscribeUrl: currentUrl,
  tokenHistory: [],
};

describe("FeedDetail", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the complete URL to viewers without a reveal control", async () => {
    mocks.writeText.mockResolvedValueOnce(undefined);
    render(
      <FeedDetail
        canManage={false}
        detail={detail}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ named: [] }}
      />
    );

    expect(screen.queryByRole("button", { name: SHOW_URL_PATTERN })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Subscribe URL for All staff" })
    ).toHaveProperty("value", currentUrl);
    expect(screen.getByText("Public holidays are included.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Rotate token" })).toBeNull();

    const subscribeHeading = screen.getByRole("heading", {
      name: "Put team availability on your calendar",
    });
    const previewHeading = screen.getByRole("heading", {
      name: "Preview and visibility",
    });
    const headings = screen.getAllByRole("heading");
    expect(headings.indexOf(subscribeHeading)).toBeLessThan(
      headings.indexOf(previewHeading)
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith(currentUrl);
    });
  });

  it("replaces the visible URL immediately after rotation", async () => {
    const replacementUrl =
      "https://calendar.example/ical/tc1.replacement.signature.ics";
    mocks.rotateTokenAction.mockResolvedValueOnce({
      ok: true,
      value: { subscribeUrl: replacementUrl, tokenId: "token-2" },
    });
    render(
      <FeedDetail
        canManage
        detail={detail}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ named: [] }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Rotate token" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));

    await waitFor(() => {
      expect(mocks.rotateTokenAction).toHaveBeenCalledWith({
        feedId: detail.id,
        organisationId: "00000000-0000-4000-8000-000000000001",
      });
      expect(screen.getByRole("textbox")).toHaveProperty(
        "value",
        replacementUrl
      );
      expect(screen.getByRole("status").textContent).toContain(
        "subscribe URL has been updated"
      );
    });
  });

  it("shows the no-token state without masking", () => {
    render(
      <FeedDetail
        canManage
        detail={{ ...detail, activeTokenHint: null, subscribeUrl: null }}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ named: [] }}
      />
    );

    expect(screen.getByText("How to subscribe")).toBeDefined();
    expect(screen.getByText(ACTIVE_FEED_NEEDED_PATTERN)).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([
    ["masked", "Subscribers see Out of office"],
    ["private", "Subscribers see Busy only"],
  ] as const)("describes the %s privacy output accurately", (mode, copy) => {
    render(
      <FeedDetail
        canManage
        detail={{ ...detail, privacyMode: mode }}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ [mode]: [] }}
      />
    );

    expect(screen.getByText(copy)).toBeDefined();
  });
});
