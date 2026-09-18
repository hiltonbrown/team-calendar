import type { PersonListItem } from "@repo/availability";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PeopleFilterInput, PeopleFilterSchema } from "./_schemas";
import { PeopleClient } from "./people-client";

interface TestNotificationEvent {
  payload: { organisationId: string; [key: string]: unknown };
  type: string;
}

const mocks = vi.hoisted(() => ({
  dispatchManualSyncAction: vi.fn(),
  inviteClerkAccessCandidatesAction: vi.fn(),
  loadClerkAccessCandidatesAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  setFilterParams: vi.fn(),
  subscribe: vi.fn<
    (listener: (event: TestNotificationEvent) => void) => () => undefined
  >(() => () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [{}, mocks.setFilterParams],
}));

vi.mock("@/app/(authenticated)/sync/_actions", () => ({
  dispatchManualSyncAction: (input: unknown) =>
    mocks.dispatchManualSyncAction(input),
}));

vi.mock("./_actions", () => ({
  inviteClerkAccessCandidatesAction: (input: unknown) =>
    mocks.inviteClerkAccessCandidatesAction(input),
  loadClerkAccessCandidatesAction: (input: unknown) =>
    mocks.loadClerkAccessCandidatesAction(input),
}));

const organisationId = "00000000-0000-4000-8000-000000000001";
const xeroTenantId = "00000000-0000-4000-8000-000000000002";
const personId = "00000000-0000-4000-8000-000000000003";
const teamId = "00000000-0000-4000-8000-000000000004";
const JANE_DOE_PATTERN = /Jane Doe/;

const defaultFilters: PeopleFilterInput = PeopleFilterSchema.parse({});

const samplePerson: PersonListItem = {
  archivedAt: null,
  avatarUrl: null,
  currentStatus: {
    activePublicHoliday: null,
    activeRecord: null,
    approvalStatus: null,
    contactabilityStatus: null,
    label: "Available",
    recordType: null,
    statusKey: "available",
  },
  email: "jane.doe@example.com",
  firstName: "Jane",
  id: personId,
  jobTitle: "Software Engineer",
  lastName: "Doe",
  location: {
    countryCode: "AU",
    id: "loc-1",
    name: "Sydney",
    regionCode: "NSW",
    timezone: "Australia/Sydney",
  },
  manager: null,
  personType: "employee",
  team: {
    id: "team-1",
    name: "Engineering",
  },
  xeroLinked: true,
  xeroSyncFailedCount: 0,
};

describe("PeopleClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("notification subscription", () => {
    it("refreshes once on relevant sync run status changed event for this organisation", async () => {
      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const listener = mocks.subscribe.mock.calls[0]?.[0];
      expect(listener).toBeDefined();

      if (!listener) {
        throw new Error(
          "Expected notification event listener to be registered"
        );
      }

      listener({
        payload: { organisationId },
        type: "sync.run_status_changed",
      });

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    });

    it("ignores sync events for different organisations", () => {
      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const listener = mocks.subscribe.mock.calls[0]?.[0];
      if (!listener) {
        throw new Error(
          "Expected notification event listener to be registered"
        );
      }

      listener({
        payload: { organisationId: "other-org-id" },
        type: "sync.run_status_changed",
      });

      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("ignores unrelated event types for the same organisation", () => {
      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const listener = mocks.subscribe.mock.calls[0]?.[0];
      if (!listener) {
        throw new Error(
          "Expected notification event listener to be registered"
        );
      }

      listener({
        payload: { organisationId },
        type: "leave.requested",
      });

      expect(mocks.refresh).not.toHaveBeenCalled();
    });
  });

  describe("manual sync action feedback", () => {
    it("displays success status and refreshes when sync completes successfully with record counts", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          eventName: "sync-xero-people",
          failed: 0,
          fetched: 5,
          queued: true,
          status: "succeeded",
          upserted: 5,
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const syncButton = screen.getByRole("button", { name: "Sync from Xero" });
      fireEvent.click(syncButton);

      await waitFor(() => {
        expect(mocks.dispatchManualSyncAction).toHaveBeenCalledWith({
          organisationId,
          runType: "people",
          xeroTenantId,
        });
      });

      const banner = await screen.findByRole("status");
      expect(banner.textContent).toBe(
        "Sync succeeded — 5 fetched, 5 upserted."
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });

    it("displays error alert and refreshes when sync completes with partial failures", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          eventName: "sync-xero-people",
          failed: 2,
          fetched: 5,
          queued: true,
          status: "partial_success",
          upserted: 3,
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const syncButton = screen.getByRole("button", { name: "Sync from Xero" });
      fireEvent.click(syncButton);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "Sync partial_success — 5 fetched, 3 upserted, 2 failed."
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });

    it("displays region stub error summary message when present", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          errorSummary: "NZ payroll employee reads are not yet available.",
          eventName: "sync-xero-people",
          queued: true,
          status: "succeeded",
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Sync from Xero" }));

      const banner = await screen.findByRole("status");
      expect(banner.textContent).toBe(
        "NZ payroll employee reads are not yet available."
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });

    it("displays generic queued confirmation when no counts or errorSummary are returned", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          eventName: "sync-xero-people",
          queued: true,
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Sync from Xero" }));

      const banner = await screen.findByRole("status");
      expect(banner.textContent).toBe("Sync queued.");
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });

    it("displays specific error alerts when sync is not queued", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          eventName: "sync-xero-people",
          queued: false,
          reason: "tenant_sync_paused",
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Sync from Xero" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "Resume Xero syncing before running this sync."
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("displays error alert when action returns an error result", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        error: {
          code: "not_authorised",
          message: "Only admins and owners can manage sync health.",
        },
        ok: false,
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Sync from Xero" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "Only admins and owners can manage sync health."
      );
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("displays error alert when action throws an exception", async () => {
      mocks.dispatchManualSyncAction.mockRejectedValueOnce(
        new Error("Network connection dropped")
      );

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Sync from Xero" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("Network connection dropped");
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("allows sync from empty state when no people exist", async () => {
      mocks.dispatchManualSyncAction.mockResolvedValueOnce({
        ok: true,
        value: {
          eventName: "sync-xero-people",
          failed: 0,
          fetched: 1,
          queued: true,
          status: "succeeded",
          upserted: 1,
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[]}
          teams={[]}
          totalCount={0}
          xeroTenantId={xeroTenantId}
        />
      );

      expect(screen.getByText("No people yet")).toBeDefined();
      const syncButtons = screen.getAllByRole("button", {
        name: "Sync from Xero",
      });
      const [firstButton] = syncButtons;
      if (!firstButton) {
        throw new Error("Expected at least one sync button");
      }
      fireEvent.click(firstButton);

      await waitFor(() => {
        expect(mocks.dispatchManualSyncAction).toHaveBeenCalledWith({
          organisationId,
          runType: "people",
          xeroTenantId,
        });
      });
    });
  });

  describe("clerk access reconciliation modal", () => {
    it("opens dialog, loads candidate review, and sends invitations upon confirmation", async () => {
      mocks.loadClerkAccessCandidatesAction.mockResolvedValue({
        ok: true,
        value: {
          alreadyInvitedCount: 1,
          candidateCount: 5,
          candidates: [
            {
              conflictReason: null,
              email: "alice@example.com",
              id: "p_1",
              name: "Alice Smith",
              state: "linkable",
            },
            {
              conflictReason: null,
              email: "bob@example.com",
              id: "p_2",
              name: "Bob Jones",
              state: "invitable",
            },
            {
              conflictReason: null,
              email: "carol@example.com",
              id: "p_3",
              name: "Carol White",
              state: "already_invited",
            },
            {
              conflictReason: null,
              email: "dave@example.com",
              id: "p_4",
              name: "Dave Black",
              state: "member",
            },
            {
              conflictReason: "duplicate_email",
              email: "eve@example.com",
              id: "p_5",
              name: "Eve Green",
              state: "conflict",
            },
          ],
          conflictCount: 1,
          invitableCount: 1,
          linkableCount: 1,
          memberCount: 1,
        },
      });

      mocks.inviteClerkAccessCandidatesAction.mockResolvedValue({
        ok: true,
        value: {
          alreadyInvitedCount: 1,
          candidateCount: 5,
          conflictCount: 1,
          failedCount: 0,
          linkedCount: 1,
          succeededCount: 1,
        },
      });

      render(
        <PeopleClient
          canIncludeArchived={true}
          canManageClerkAccess={true}
          filters={defaultFilters}
          hasActiveXeroConnection={true}
          locations={[]}
          nextCursor={null}
          organisationId={organisationId}
          orgQueryValue={organisationId}
          people={[samplePerson]}
          teams={[]}
          totalCount={1}
          xeroTenantId={xeroTenantId}
        />
      );

      const reconcileBtn = screen.getByRole("button", {
        name: "Reconcile Clerk access",
      });
      fireEvent.click(reconcileBtn);

      await waitFor(() => {
        expect(mocks.loadClerkAccessCandidatesAction).toHaveBeenCalledWith({
          organisationId,
        });
      });

      expect(
        await screen.findByRole("heading", { name: "Reconcile Clerk access" })
      ).toBeDefined();
      expect(screen.getByText("Alice Smith")).toBeDefined();
      expect(screen.getByText("Bob Jones")).toBeDefined();
      expect(screen.getByText("duplicate email")).toBeDefined();

      const sendBtn = screen.getByRole("button", {
        name: "Send invitations & link",
      });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(mocks.inviteClerkAccessCandidatesAction).toHaveBeenCalledWith({
          organisationId,
        });
      });

      expect(await screen.findByText("Reconciliation completed")).toBeDefined();
      expect(screen.getByText("1 existing accounts linked")).toBeDefined();
      expect(screen.getByText("1 invitations sent")).toBeDefined();

      const doneBtn = screen.getByRole("button", { name: "Done" });
      fireEvent.click(doneBtn);

      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it("keeps search primary and exposes a wrapping mobile profile path", () => {
    const filters = PeopleFilterSchema.parse({
      search: "Jane",
      teamId: [teamId],
    });
    render(
      <PeopleClient
        canIncludeArchived
        filters={filters}
        hasActiveXeroConnection
        locations={[]}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        people={[samplePerson]}
        teams={[{ id: teamId, name: "Engineering" }]}
        totalCount={1}
        xeroTenantId={xeroTenantId}
      />
    );

    expect(screen.getByDisplayValue("Jane")).toBeDefined();
    expect(screen.getByText("More filters (1 active)")).toBeDefined();
    expect(screen.getByText("Team: Engineering")).toBeDefined();
    const directory = screen.getByRole("table", { name: "People directory" });
    expect(directory.className).toContain("block");
    expect(
      screen.getByRole("link", { name: JANE_DOE_PATTERN }).getAttribute("href")
    ).toBe(`/people/${personId}?org=${organisationId}`);
  });
});
