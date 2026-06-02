import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveRecord: vi.fn(),
  auth: vi.fn(),
  createRecord: vi.fn(),
  currentUser: vi.fn(),
  deleteDraftRecord: vi.fn(),
  getActiveOrgContext: vi.fn(),
  retrySubmission: vi.fn(),
  revertToDraft: vi.fn(),
  restoreRecord: vi.fn(),
  revalidatePath: vi.fn(),
  submitDraftRecord: vi.fn(),
  updateRecord: vi.fn(),
  withdrawSubmission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
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
  retrySubmission: mocks.retrySubmission,
  revertToDraft: mocks.revertToDraft,
  restoreRecord: mocks.restoreRecord,
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

  it("revalidates expected paths on submit success", async () => {
    mocks.submitDraftRecord.mockResolvedValue({
      ok: true,
      value: {
        approval_status: "submitted",
        id: "00000000-0000-4000-8000-000000000099",
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
