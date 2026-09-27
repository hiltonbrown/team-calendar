import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordForm } from "./record-form";
import { loadPlanFormData } from "./record-form-data";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getRecord: vi.fn(),
  leaveBalance: vi.fn(),
  organisation: vi.fn(),
  person: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
const organisationId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000011";
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: async () => ({ orgRole: "org:viewer" }),
  currentUser: async () => ({ id: "user_1" }),
}));
vi.mock("@repo/availability", () => ({
  getRecord: mocks.getRecord,
  getXeroConnectionStateForScope: async () => ({
    ok: true,
    value: { state: "not_connected" },
  }),
  isXeroLeaveType: (value: string) => value === "annual_leave",
}));
vi.mock("@repo/database", () => ({
  database: {
    leaveBalance: { findFirst: mocks.leaveBalance },
    organisation: { findFirst: mocks.organisation },
    person: { findFirst: mocks.person },
  },
  scopedQuery: (clerkOrgId: string, payrollOrganisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: payrollOrganisationId,
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: async () => ({
    clerkOrgId: "org_1",
    organisationId: "00000000-0000-4000-8000-000000000001",
    orgQueryValue: "org_1",
  }),
}));
vi.mock("./_actions", () => ({
  createRecordAction: mocks.create,
  updateRecordAction: vi.fn(),
}));
class ResizeObserverMock {
  disconnect() {
    // No-op: resize callbacks are not needed for this form test.
  }
  observe() {
    // No-op: resize callbacks are not needed for this form test.
  }
  unobserve() {
    // No-op: resize callbacks are not needed for this form test.
  }
}
globalThis.ResizeObserver = ResizeObserverMock;

describe("calendar slot plan form loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.person.mockResolvedValue({
      email: "ari@example.com",
      first_name: "Ari",
      id: personId,
      last_name: "Report",
    });
    mocks.organisation.mockResolvedValue({ timezone: "Australia/Brisbane" });
    mocks.leaveBalance.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ ok: true, value: { id: "record" } });
  });
  afterEach(cleanup);

  it("loads and submits the selected wall-clock hour in timed mode", async () => {
    const data = await loadPlanFormData({
      org: "org_1",
      personId,
      startsAt: "2026-04-15T09:00",
    });
    expect(data.record).toMatchObject({
      allDay: false,
      endsAt: "2026-04-15",
      endTime: "10:00",
      startsAt: "2026-04-15",
      startTime: "09:00",
    });
    const { container } = render(<RecordForm mode="create" {...data} />);
    expect(screen.getByText("Times are in Australia/Brisbane.")).toBeDefined();
    expect(screen.getByLabelText("Start time").getAttribute("value")).toBe(
      "09:00"
    );
    expect(screen.getByLabelText("End time").getAttribute("value")).toBe(
      "10:00"
    );
    const form = container.querySelector("form");
    if (!form) {
      throw new Error("Expected plan form");
    }
    fireEvent.submit(form);
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          allDay: false,
          endsAt: "2026-04-15",
          endTime: "10:00",
          startsAt: "2026-04-15",
          startTime: "09:00",
        })
      )
    );
    expect(mocks.organisation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archived_at: null, clerk_org_id: "org_1", id: organisationId },
      })
    );
  });
  it("rolls a 23:00 slot end into the next local day", async () => {
    const data = await loadPlanFormData({ startsAt: "2026-04-15T23:00" });
    expect(data.record).toMatchObject({
      allDay: false,
      endsAt: "2026-04-16",
      endTime: "00:00",
    });
  });
  it("keeps date-only creation all day", async () => {
    const data = await loadPlanFormData({ startsAt: "2026-04-15" });
    expect(data.record).toMatchObject({
      allDay: true,
      endTime: "",
      startsAt: "2026-04-15",
      startTime: "",
    });
  });
  it.each([
    "2026-02-30",
    "2026-04-15T25:00",
    "2026-04-15T09:00:00.000Z",
    "2026-04-15T09:00Z",
  ])("ignores ambiguous or invalid prefill %s", async (startsAt) => {
    expect((await loadPlanFormData({ startsAt })).record).toBeUndefined();
  });
  it("formats timed edits in the organisation timezone without changing dates", async () => {
    mocks.getRecord.mockResolvedValue({
      ok: true,
      value: {
        allDay: false,
        contactabilityStatus: "contactable",
        endsAt: new Date("2026-04-15T00:00:00Z"),
        id: "record",
        notesInternal: null,
        personId,
        privacyMode: "named",
        recordType: "wfh",
        startsAt: new Date("2026-04-14T23:00:00Z"),
      },
    });
    const data = await loadPlanFormData({ recordId: "record" });
    expect(data.record).toMatchObject({
      endsAt: "2026-04-15",
      endTime: "10:00",
      startsAt: "2026-04-15",
      startTime: "09:00",
    });
  });
  it("keeps all-day edit dates independent of western timezone", async () => {
    mocks.organisation.mockResolvedValue({ timezone: "America/New_York" });
    mocks.getRecord.mockResolvedValue({
      ok: true,
      value: {
        allDay: true,
        contactabilityStatus: "contactable",
        endsAt: new Date("2026-04-15T23:59:59Z"),
        id: "record",
        notesInternal: null,
        personId,
        privacyMode: "named",
        recordType: "wfh",
        startsAt: new Date("2026-04-15T00:00:00Z"),
      },
    });
    expect(
      (await loadPlanFormData({ recordId: "record" })).record
    ).toMatchObject({ endsAt: "2026-04-15", startsAt: "2026-04-15" });
  });
});
