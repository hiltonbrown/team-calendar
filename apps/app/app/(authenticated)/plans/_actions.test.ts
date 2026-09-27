import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanRecordFormInput } from "./_schemas";

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsFlush: vi.fn(),
  archiveRecord: vi.fn(),
  auth: vi.fn(),
  availabilityFindFirst: vi.fn(),
  createRecord: vi.fn(),
  currentUser: vi.fn(),
  deleteDraftRecord: vi.fn(),
  getActiveOrgContext: vi.fn(),
  organisationFindFirst: vi.fn(),
  restoreRecord: vi.fn(),
  retrySubmission: vi.fn(),
  revalidatePath: vi.fn(),
  revertToDraft: vi.fn(),
  submitDraftRecord: vi.fn(),
  updateRecord: vi.fn(),
  withdrawSubmission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.analyticsCapture, flush: mocks.analyticsFlush },
}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: { findFirst: mocks.availabilityFindFirst },
    organisation: { findFirst: mocks.organisationFindFirst },
  },
}));
vi.mock("@repo/xero", () => ({
  XeroWriteAdapter: {},
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  archiveRecord: mocks.archiveRecord,
  createRecord: mocks.createRecord,
  deleteDraftRecord: mocks.deleteDraftRecord,
  restoreRecord: mocks.restoreRecord,
  retrySubmission: mocks.retrySubmission,
  revertToDraft: mocks.revertToDraft,
  submitDraftRecord: mocks.submitDraftRecord,
  updateRecord: mocks.updateRecord,
  withdrawSubmission: mocks.withdrawSubmission,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const {
  createRecordAction,
  retrySubmissionAction,
  revertToDraftAction,
  submitForApprovalAction,
  updateRecordAction,
  withdrawSubmissionAction,
} = await import("./_actions");

const validInput = {
  allDay: true,
  contactabilityStatus: "contactable",
  endsAt: "2026-05-05",
  endTime: "",
  notesInternal: "",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
  privacyMode: "named",
  recordType: "annual_leave",
  startsAt: "2026-05-04",
  startTime: "",
} as const;

describe("plans actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyticsFlush.mockResolvedValue(undefined);
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Brisbane",
    });
    mocks.availabilityFindFirst.mockImplementation(({ select }) =>
      Promise.resolve(
        select.starts_at
          ? null
          : {
              submitted_at: new Date("2026-09-19T01:00:00.000Z"),
            }
      )
    );
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: {
        clerkOrgId: "org_1",
        organisationId: validInput.organisationId,
      },
    });
  });

  it("rejects unauthorised callers", async () => {
    mocks.auth.mockResolvedValue({ orgRole: null });

    const result = await createRecordAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_authorised");
    }
  });

  it("rejects malformed input", async () => {
    const result = await createRecordAction({
      ...validInput,
      personId: "not-a-uuid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("revalidates expected paths on create success", async () => {
    mocks.createRecord.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000099" },
    });

    const result = await createRecordAction(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("revalidates plans and calendar on update success", async () => {
    mocks.updateRecord.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000099" },
    });

    const result = await updateRecordAction({
      ...validInput,
      recordId: "00000000-0000-4000-8000-000000000099",
    });

    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("saves a 09:00 selected slot in the authoritative organisation timezone", async () => {
    mocks.createRecord.mockResolvedValue({ ok: true, value: { id: "record" } });
    const result = await createRecordAction({
      ...validInput,
      allDay: false,
      endsAt: "2026-04-15",
      endTime: "10:00",
      startsAt: "2026-04-15",
      startTime: "09:00",
    });
    expect(result.ok).toBe(true);
    expect(mocks.organisationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archived_at: null,
          clerk_org_id: "org_1",
          id: validInput.organisationId,
        },
      })
    );
    expect(mocks.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        allDay: false,
        endsAt: new Date("2026-04-15T00:00:00Z"),
        startsAt: new Date("2026-04-14T23:00:00Z"),
      })
    );
  });

  it("rejects nonexistent local times without writing a record", async () => {
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Sydney",
    });
    const result = await createRecordAction({
      ...validInput,
      allDay: false,
      endsAt: "2026-10-04",
      endTime: "04:00",
      startsAt: "2026-10-04",
      startTime: "02:30",
    });
    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(mocks.createRecord).not.toHaveBeenCalled();
  });

  it("preserves original timed instants on a note-only edit during a repeated DST hour", async () => {
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Sydney",
    });
    const startsAt = new Date("2026-04-04T16:30:22Z");
    const endsAt = new Date("2026-04-04T17:30:22Z");
    mocks.availabilityFindFirst.mockResolvedValue({
      all_day: false,
      ends_at: endsAt,
      starts_at: startsAt,
    });
    mocks.updateRecord.mockResolvedValue({ ok: true, value: { id: "record" } });
    const result = await updateRecordAction({
      ...validInput,
      allDay: false,
      endsAt: "2026-04-05",
      endTime: "03:30",
      notesInternal: "Changed note",
      recordId: "00000000-0000-4000-8000-000000000099",
      startsAt: "2026-04-05",
      startTime: "02:30",
    });
    expect(result.ok).toBe(true);
    expect(mocks.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({ endsAt, startsAt }),
      })
    );
    expect(mocks.availabilityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          organisation_id: validInput.organisationId,
        }),
      })
    );
  });

  it.each(["", "Changed note"])(
    "preserves a valid interval crossing the repeated hour while saving notes %s",
    async (notesInternal) => {
      mocks.organisationFindFirst.mockResolvedValue({
        timezone: "Australia/Sydney",
      });
      const startsAt = new Date("2026-04-04T15:50:00Z");
      const endsAt = new Date("2026-04-04T16:10:00Z");
      mocks.availabilityFindFirst.mockResolvedValue({
        all_day: false,
        ends_at: endsAt,
        starts_at: startsAt,
      });
      mocks.updateRecord.mockResolvedValue({
        ok: true,
        value: { id: "record" },
      });
      const result = await updateRecordAction({
        ...validInput,
        allDay: false,
        endsAt: "2026-04-05",
        endTime: "02:10",
        notesInternal,
        recordId: "00000000-0000-4000-8000-000000000099",
        recordType: "wfh",
        startsAt: "2026-04-05",
        startTime: "02:50",
      });
      expect(result.ok).toBe(true);
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({ endsAt, notesInternal, startsAt }),
        })
      );
      expect(endsAt.getTime() - startsAt.getTime()).toBe(20 * 60_000);
    }
  );

  it.each(["create", "update"])(
    "rejects a reversed new repeated-hour interval on %s before writing",
    async (mode) => {
      mocks.organisationFindFirst.mockResolvedValue({
        timezone: "Australia/Sydney",
      });
      const input = {
        ...validInput,
        allDay: false,
        endsAt: "2026-04-05",
        endTime: "02:10",
        recordType: "wfh",
        startsAt: "2026-04-05",
        startTime: "02:50",
      } satisfies PlanRecordFormInput;
      const result =
        mode === "create"
          ? await createRecordAction(input)
          : await updateRecordAction({
              ...input,
              recordId: "00000000-0000-4000-8000-000000000099",
            });
      expect(result).toMatchObject({
        error: {
          code: "validation_error",
          message: "End date must be after start date",
        },
        ok: false,
      });
      expect(mocks.createRecord).not.toHaveBeenCalled();
      expect(mocks.updateRecord).not.toHaveBeenCalled();
    }
  );

  it("rejects an actually reversed edit of an existing cross-fold interval", async () => {
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Sydney",
    });
    mocks.availabilityFindFirst.mockResolvedValue({
      all_day: false,
      ends_at: new Date("2026-04-04T16:10:00Z"),
      starts_at: new Date("2026-04-04T15:50:00Z"),
    });
    const result = await updateRecordAction({
      ...validInput,
      allDay: false,
      endsAt: "2026-04-05",
      endTime: "01:10",
      recordId: "00000000-0000-4000-8000-000000000099",
      recordType: "wfh",
      startsAt: "2026-04-05",
      startTime: "02:50",
    });
    expect(result).toMatchObject({
      error: {
        code: "validation_error",
        message: "End date must be after start date",
      },
      ok: false,
    });
    expect(mocks.updateRecord).not.toHaveBeenCalled();
  });

  it("revalidates expected paths on submit success", async () => {
    mocks.submitDraftRecord.mockResolvedValue({
      ok: true,
      value: {
        approval_status: "submitted",
        id: "00000000-0000-4000-8000-000000000099",
        submitted_at: new Date("2026-09-19T01:00:00.000Z"),
        xero_write_error: null,
      },
    });

    const result = await submitForApprovalAction({
      organisationId: validInput.organisationId,
      recordId: "00000000-0000-4000-8000-000000000099",
    });

    expect(result.ok).toBe(true);
    expect(mocks.submitDraftRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actingOrgRole: "org:viewer",
        actingUserId: "user_1",
        clerkOrgId: "org_1",
      }),
      expect.anything()
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/notifications");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("passes retry, revert and withdraw through typed service results", async () => {
    const value = {
      approval_status: "xero_sync_failed",
      id: "00000000-0000-4000-8000-000000000099",
      xero_write_error: "Could not reach Xero.",
    };
    mocks.retrySubmission.mockResolvedValue({ ok: true, value });
    mocks.revertToDraft.mockResolvedValue({
      ok: true,
      value: { ...value, approval_status: "draft", xero_write_error: null },
    });
    mocks.withdrawSubmission.mockResolvedValue({
      ok: true,
      value: { ...value, approval_status: "withdrawn", xero_write_error: null },
    });

    const input = {
      organisationId: validInput.organisationId,
      recordId: "00000000-0000-4000-8000-000000000099",
    };

    await expect(retrySubmissionAction(input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(revertToDraftAction(input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(withdrawSubmissionAction(input)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("returns validation errors for malformed submission action input", async () => {
    const result = await submitForApprovalAction({
      organisationId: validInput.organisationId,
      recordId: "not-a-uuid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });
});
