import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { XeroPersonMatchView } from "./_match-view";
import { MatchesClient } from "./matches-client";

const mocks = vi.hoisted(() => ({
  resolveXeroPersonMatchAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@repo/design-system/components/ui/sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("./_actions", () => ({
  resolveXeroPersonMatchAction: mocks.resolveXeroPersonMatchAction,
}));

const organisationId = "00000000-0000-4000-8000-000000000001";
const matchId1 = "00000000-0000-4000-8000-000000000011";
const matchId2 = "00000000-0000-4000-8000-000000000022";

describe("MatchesClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty state when there are no matches", () => {
    render(<MatchesClient matches={[]} organisationId={organisationId} />);
    expect(screen.getByText("No pending matches")).toBeDefined();
    expect(
      screen.getByText(
        "Team Calendar will show possible Xero and manual person matches here for explicit admin review."
      )
    ).toBeDefined();
  });

  it("renders match details with candidate person present", () => {
    const matches: XeroPersonMatchView[] = [
      {
        candidate_person: {
          email: "sarah.connor@example.com",
          first_name: "Sarah",
          last_name: "Connor",
          user_id: "user_cand123",
        },
        id: matchId1,
        xero_person: {
          email: "sarah@work.com",
          first_name: "Sarah",
          last_name: "Connor",
        },
      },
    ];

    render(<MatchesClient matches={matches} organisationId={organisationId} />);

    expect(screen.getByText("Sarah Connor")).toBeDefined();
    expect(screen.getByText("Xero person: sarah@work.com")).toBeDefined();
    expect(
      screen.getByText("Sarah Connor · sarah.connor@example.com")
    ).toBeDefined();
    expect(screen.getByPlaceholderText("user_cand123")).toBeDefined();
  });

  it("renders match details when candidate person is null and email is empty", () => {
    const matches: XeroPersonMatchView[] = [
      {
        candidate_person: null,
        id: matchId2,
        xero_person: {
          email: "",
          first_name: "John",
          last_name: "Doe",
        },
      },
    ];

    render(<MatchesClient matches={matches} organisationId={organisationId} />);

    expect(screen.getByText("John Doe")).toBeDefined();
    expect(screen.getByText("Xero person: No email provided")).toBeDefined();
    expect(
      screen.getByText("No candidate person was stored for this match.")
    ).toBeDefined();
    expect(screen.getByPlaceholderText("Enter user ID to link")).toBeDefined();
  });

  it("links to user with custom entered user ID", async () => {
    mocks.resolveXeroPersonMatchAction.mockResolvedValue({
      ok: true,
      value: { resolved: true },
    });

    const matches: XeroPersonMatchView[] = [
      {
        candidate_person: {
          email: "sarah@example.com",
          first_name: "Sarah",
          last_name: "Connor",
          user_id: "user_default",
        },
        id: matchId1,
        xero_person: {
          email: "sarah@work.com",
          first_name: "Sarah",
          last_name: "Connor",
        },
      },
    ];

    render(<MatchesClient matches={matches} organisationId={organisationId} />);

    const input = screen.getByPlaceholderText("user_default");
    fireEvent.change(input, { target: { value: "user_custom456" } });

    const linkButton = screen.getByRole("button", {
      name: "Link to user",
    });
    fireEvent.click(linkButton);

    await waitFor(() => {
      expect(mocks.resolveXeroPersonMatchAction).toHaveBeenCalledWith({
        matchId: matchId1,
        organisationId,
        resolution: "match",
        userId: "user_custom456",
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Xero person linked.");
    });
  });

  it("links to user using default candidate person user ID when none entered", async () => {
    mocks.resolveXeroPersonMatchAction.mockResolvedValue({
      ok: true,
      value: { resolved: true },
    });

    const matches: XeroPersonMatchView[] = [
      {
        candidate_person: {
          email: "sarah@example.com",
          first_name: "Sarah",
          last_name: "Connor",
          user_id: "user_candidate_default",
        },
        id: matchId1,
        xero_person: {
          email: "sarah@work.com",
          first_name: "Sarah",
          last_name: "Connor",
        },
      },
    ];

    render(<MatchesClient matches={matches} organisationId={organisationId} />);

    const linkButton = screen.getByRole("button", {
      name: "Link to user",
    });
    fireEvent.click(linkButton);

    await waitFor(() => {
      expect(mocks.resolveXeroPersonMatchAction).toHaveBeenCalledWith({
        matchId: matchId1,
        organisationId,
        resolution: "match",
        userId: "user_candidate_default",
      });
    });
  });

  it("ignores match and displays error toast on failure", async () => {
    mocks.resolveXeroPersonMatchAction.mockResolvedValue({
      error: { code: "unknown_error", message: "Database connection failed" },
      ok: false,
    });

    const matches: XeroPersonMatchView[] = [
      {
        candidate_person: null,
        id: matchId2,
        xero_person: {
          email: "john@work.com",
          first_name: "John",
          last_name: "Doe",
        },
      },
    ];

    render(<MatchesClient matches={matches} organisationId={organisationId} />);

    const ignoreButton = screen.getByRole("button", {
      name: "Keep separate",
    });
    fireEvent.click(ignoreButton);

    await waitFor(() => {
      expect(mocks.resolveXeroPersonMatchAction).toHaveBeenCalledWith({
        matchId: matchId2,
        organisationId,
        resolution: "ignore",
      });
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Database connection failed"
      );
    });
  });
});
