import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addPersonAction: vi.fn(),
  advanceStepAction: vi.fn(),
  createSelfAction: vi.fn(),
  linkSelfAction: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  resolveXeroPersonMatchAction: vi.fn(),
  sendInvitesAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("../_actions", () => ({
  addPersonAction: mocks.addPersonAction,
  advanceStepAction: mocks.advanceStepAction,
  createSelfAction: mocks.createSelfAction,
  linkSelfAction: mocks.linkSelfAction,
  sendInvitesAction: mocks.sendInvitesAction,
}));
vi.mock(
  "@/app/(authenticated)/settings/integrations/xero/matches/_actions",
  () => ({ resolveXeroPersonMatchAction: mocks.resolveXeroPersonMatchAction })
);

class ResizeObserverMock {
  disconnect() {
    // jsdom has no layout to observe.
  }
  observe() {
    // jsdom has no layout to observe.
  }
  unobserve() {
    // jsdom has no layout to observe.
  }
}
globalThis.ResizeObserver = ResizeObserverMock;

const { PeopleStep } = await import("./people-step");
const { InviteStep } = await import("./invite-step");
const organisationId = "00000000-0000-4000-8000-000000000001";
const IMPORTING = /Importing people from Xero/;
const DID_NOT_FINISH = /did not finish/;

const baseProps = {
  actingPerson: { id: "p0", name: "Ava Lee" },
  doneHref: "/onboarding",
  matches: [],
  mode: "xero" as const,
  organisationId,
  peopleCount: 12,
  peopleStage: "complete" as const,
  selfCandidates: [],
};

function match(index: number) {
  return {
    candidate_person: {
      clerk_user_id: null,
      email: `old${index}@example.test`,
      first_name: "Old",
      last_name: `Person ${index}`,
    },
    id: `match-${index}`,
    xero_person: {
      email: `x${index}@example.test`,
      first_name: "Xero",
      last_name: `Person ${index}`,
    },
  };
}

describe("PeopleStep", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("polls while people import and blocks continuing", () => {
    render(<PeopleStep {...baseProps} peopleCount={3} peopleStage="running" />);
    expect(screen.getByText(IMPORTING).textContent).toContain(
      "3 people so far"
    );
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops polling once the import is complete", () => {
    render(<PeopleStep {...baseProps} />);
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("12 people imported from Xero.")).toBeTruthy();
  });

  it("explains a failed import and still lets the admin continue", async () => {
    mocks.advanceStepAction.mockResolvedValue({ ok: true, value: {} });
    render(<PeopleStep {...baseProps} peopleStage="failed" />);
    expect(screen.getByText(DID_NOT_FINISH)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.advanceStepAction).toHaveBeenCalledWith({
        from: "people",
        organisationId,
      })
    );
  });

  it("resolves duplicates inline and links to the full list beyond ten", async () => {
    mocks.resolveXeroPersonMatchAction.mockResolvedValue({
      ok: true,
      value: { resolved: true },
    });
    const { unmount } = render(
      <PeopleStep {...baseProps} matches={[match(1)]} />
    );
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep separate" }));
    await waitFor(() =>
      expect(mocks.resolveXeroPersonMatchAction).toHaveBeenCalledWith({
        matchId: "match-1",
        organisationId,
        resolution: "ignore",
      })
    );
    unmount();
    render(
      <PeopleStep
        {...baseProps}
        matches={Array.from({ length: 11 }, (_, index) => match(index))}
      />
    );
    expect(
      screen.getAllByRole("button", { name: "Keep separate" })
    ).toHaveLength(10);
    expect(
      screen
        .getByRole("link", { name: "Review all possible duplicates" })
        .getAttribute("href")
    ).toBe("/settings/integrations/xero/matches");
  });

  it("asks an unlinked admin which person they are", async () => {
    mocks.createSelfAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <PeopleStep
        {...baseProps}
        actingPerson={null}
        selfCandidates={[
          {
            email: "ava@payroll.test",
            hasDirectReports: false,
            id: "p1",
            name: "Ava Lee",
          },
        ]}
      />
    );
    expect(screen.getByText("Which person are you?")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "This is me" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "I'm not listed, create my record" })
    );
    await waitFor(() =>
      expect(mocks.createSelfAction).toHaveBeenCalledWith({ organisationId })
    );
  });

  it("offers adding people in manual mode", async () => {
    mocks.addPersonAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <PeopleStep {...baseProps} mode="manual" peopleStage="not_started" />
    );
    expect(screen.queryByText(IMPORTING)).toBeNull();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Ben" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Ng" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ben@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Ben Ng added."
    );
  });
});

describe("InviteStep", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const roster = [
    {
      email: "mia@example.test",
      hasDirectReports: true,
      id: "p1",
      name: "Mia Chen",
    },
    {
      email: "tom@example.test",
      hasDirectReports: false,
      id: "p2",
      name: "Tom Hall",
    },
  ];

  it("defaults managers to Manager and others to Viewer, and offers no owner role", () => {
    render(
      <InviteStep
        doneHref="/onboarding"
        organisationId={organisationId}
        roster={roster}
      />
    );
    expect(
      screen.getByRole("combobox", { name: "Role for Mia Chen" }).textContent
    ).toBe("Manager");
    expect(
      screen.getByRole("combobox", { name: "Role for Tom Hall" }).textContent
    ).toBe("Viewer");
    expect(screen.queryByText("Owner")).toBeNull();
  });

  it("reports per-row outcomes and keeps failures listed", async () => {
    mocks.sendInvitesAction.mockResolvedValue({
      ok: true,
      value: {
        results: [
          { email: "mia@example.test", ok: true },
          {
            email: "tom@example.test",
            ok: false,
            reason: "Already invited or already a member.",
          },
        ],
      },
    });
    render(
      <InviteStep
        doneHref="/onboarding"
        organisationId={organisationId}
        roster={roster}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Send 2 invitations" }));
    expect(await screen.findByText("Invitation sent")).toBeTruthy();
    expect(
      screen.getByText("Already invited or already a member.")
    ).toBeTruthy();
    expect(mocks.sendInvitesAction).toHaveBeenCalledWith({
      organisationId,
      rows: [
        { email: "mia@example.test", role: "org:manager" },
        { email: "tom@example.test", role: "org:viewer" },
      ],
    });
    expect(
      screen.getByRole("button", { name: "Send 1 invitation" })
    ).toBeTruthy();
  });

  it("skips without sending", async () => {
    mocks.advanceStepAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <InviteStep
        doneHref="/onboarding"
        organisationId={organisationId}
        roster={[]}
      />
    );
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(mocks.advanceStepAction).toHaveBeenCalledWith({
        from: "invites",
        organisationId,
      })
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding")
    );
    expect(mocks.sendInvitesAction).not.toHaveBeenCalled();
  });
});
