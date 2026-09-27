import {
  act,
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
  issueTokenAction: vi.fn(),
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
  issueTokenAction: (input: unknown) => mocks.issueTokenAction(input),
  pauseFeedAction: (input: unknown) => mocks.pauseFeedAction(input),
  restoreFeedAction: (input: unknown) => mocks.restoreFeedAction(input),
  resumeFeedAction: (input: unknown) => mocks.resumeFeedAction(input),
  rotateTokenAction: (input: unknown) => mocks.rotateTokenAction(input),
}));

const currentUrl = "https://calendar.example/ical/tc1.current.signature.ics";
const ACTIVE_FEED_NEEDED_PATTERN =
  /An active feed is needed before you can add/;
const EMPTY_PREVIEW_PATTERN = /No upcoming events/;
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

  it("displays and copies an issued URL immediately before refreshed props arrive", async () => {
    const issuedUrl = "https://calendar.example/ical/tc1.issued.signature.ics";
    mocks.issueTokenAction.mockResolvedValueOnce({
      ok: true,
      value: { subscribeUrl: issuedUrl, tokenId: "token-issued" },
    });
    mocks.writeText.mockResolvedValueOnce(undefined);
    render(
      <FeedDetail
        canManage
        detail={{
          ...detail,
          activeTokenHint: null,
          status: "paused",
          subscribeUrl: null,
        }}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ named: [] }}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create subscribe URL" })
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveProperty("value", issuedUrl)
    );
    expect(mocks.issueTokenAction).toHaveBeenCalledWith({
      feedId: detail.id,
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith(issuedUrl)
    );
  });

  it("hides the URL immediately after a successful archive receipt", async () => {
    mocks.archiveFeedAction.mockResolvedValueOnce({
      ok: true,
      value: { feedId: detail.id },
    });
    render(
      <FeedDetail
        canManage
        detail={detail}
        organisationId="00000000-0000-4000-8000-000000000001"
        previews={{ named: [] }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive feed" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull();
    expect(mocks.archiveFeedAction).toHaveBeenCalledWith({
      feedId: detail.id,
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("lets refreshed archive, restored no-token and replacement props supersede a rotation receipt", async () => {
    const rotatedUrl =
      "https://calendar.example/ical/tc1.rotated.signature.ics";
    mocks.rotateTokenAction.mockResolvedValueOnce({
      ok: true,
      value: { subscribeUrl: rotatedUrl, tokenId: "token-rotated" },
    });
    const props = {
      canManage: true,
      organisationId: "00000000-0000-4000-8000-000000000001",
      previews: { named: [] },
    };
    const { rerender } = render(<FeedDetail {...props} detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate token" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveProperty("value", rotatedUrl)
    );
    rerender(
      <FeedDetail
        {...props}
        detail={{
          ...detail,
          activeTokenHint: null,
          status: "archived",
          subscribeUrl: null,
        }}
      />
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    rerender(
      <FeedDetail
        {...props}
        detail={{
          ...detail,
          activeTokenHint: null,
          status: "paused",
          subscribeUrl: null,
        }}
      />
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create subscribe URL" })
    ).toBeDefined();
    const authoritativeUrl =
      "https://calendar.example/ical/tc1.authoritative.signature.ics";
    rerender(
      <FeedDetail
        {...props}
        detail={{ ...detail, subscribeUrl: authoritativeUrl }}
      />
    );
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      authoritativeUrl
    );
  });

  it("does not let delayed rotation completion resurrect a refreshed archived or restored URL", async () => {
    let completeRotation: (value: {
      ok: true;
      value: { subscribeUrl: string; tokenId: string };
    }) => void = () => {
      throw new Error("Rotation not started");
    };
    const pendingRotation = new Promise<{
      ok: true;
      value: { subscribeUrl: string; tokenId: string };
    }>((resolve) => {
      completeRotation = resolve;
    });
    mocks.rotateTokenAction.mockReturnValueOnce(pendingRotation);
    const props = {
      canManage: true,
      organisationId: "00000000-0000-4000-8000-000000000001",
      previews: { named: [] },
    };
    const { rerender } = render(<FeedDetail {...props} detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate token" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(mocks.rotateTokenAction).toHaveBeenCalledOnce();
    rerender(
      <FeedDetail
        {...props}
        detail={{
          ...detail,
          activeTokenHint: null,
          status: "archived",
          subscribeUrl: null,
        }}
      />
    );
    await act(async () => {
      completeRotation({
        ok: true,
        value: {
          subscribeUrl:
            "https://calendar.example/ical/tc1.delayed.signature.ics",
          tokenId: "late-token",
        },
      });
      await pendingRotation;
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull();
    rerender(
      <FeedDetail
        {...props}
        detail={{
          ...detail,
          activeTokenHint: null,
          status: "paused",
          subscribeUrl: null,
        }}
      />
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("distinguishes preview failure from empty success and retries by refreshing", () => {
    const props = {
      canManage: false,
      detail,
      organisationId: "00000000-0000-4000-8000-000000000001",
      previews: { named: [] },
    };
    const { rerender } = render(
      <FeedDetail
        {...props}
        previewErrors={{ named: "The preview could not be loaded." }}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The preview could not be loaded."
    );
    expect(screen.queryByText(EMPTY_PREVIEW_PATTERN)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    rerender(<FeedDetail {...props} previewErrors={{}} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry preview" })).toBeNull();
    expect(screen.getByText(EMPTY_PREVIEW_PATTERN)).toBeDefined();
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
